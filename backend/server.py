from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import re
import json
import uuid
import random
import hashlib
import logging
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field, BeforeValidator, ConfigDict, AliasChoices
from typing import List, Optional, Annotated
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
LLM_KEY = os.environ['EMERGENT_LLM_KEY']
TTS_DIR = ROOT_DIR / "tts_cache"
TTS_DIR.mkdir(exist_ok=True)

app = FastAPI()
api_router = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------- models
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, validation_alias=AliasChoices("_id", "id"))

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)

    def to_mongo(self) -> dict:
        return self.model_dump(exclude={"id"})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Transaction(BaseDocument):
    provider: str  # bKash | Nagad | Rocket
    type: str  # Send Money | Cash Out | Payment | Received
    amount: float
    counterparty: str
    trx_id: str
    time: str
    balance: float
    suspicious: bool = False
    risk_score: int = 0
    reasons_en: List[str] = []
    reasons_bn: List[str] = []
    status: str = "normal"  # normal | pending_review | confirmed_mine | reported
    sms: str = ""


class FraudNumber(BaseDocument):
    number: str
    report_count: int
    providers: List[str]
    scam_types: List[str]
    last_reported: str
    flagged_high_risk: bool = False


class CommunityReport(BaseDocument):
    masked_number: str
    provider: str
    scam_type: str
    scam_type_bn: str
    amount: float
    area: str
    time: str


class Complaint(BaseDocument):
    provider: str
    trx_id: str
    amount: float
    recipient_number: str
    time: str
    scam_type: str
    description: str
    draft_en: str
    draft_bn: str
    reference: str
    transaction_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class NumberCheckIn(BaseModel):
    number: str


class ExtractTextIn(BaseModel):
    text: str


class ExtractImageIn(BaseModel):
    image_base64: str


class TtsIn(BaseModel):
    text: str


class ComplaintIn(BaseModel):
    provider: str
    trx_id: str
    amount: float
    recipient_number: str
    time: str
    scam_type: str
    description: str = ""
    transaction_id: Optional[str] = None


# ---------------------------------------------------------------- helpers
def normalize_number(n: str) -> str:
    digits = re.sub(r"\D", "", n or "")
    if digits.startswith("880"):
        digits = "0" + digits[3:]
    return digits


def mask(n: str) -> str:
    d = normalize_number(n)
    return f"{d[:3]}****{d[-4:]}" if len(d) >= 7 else d


SCAM_BN = {
    "Fake prize / lottery": "ভুয়া লটারি / পুরস্কার",
    "Impersonation (agent/provider)": "এজেন্ট/কোম্পানি সেজে প্রতারণা",
    "Wrong send / refund trick": "ভুল পাঠানো / ফেরত প্রতারণা",
    "OTP / PIN phishing": "ওটিপি / পিন ফিশিং",
    "Fake job / loan offer": "ভুয়া চাকরি / ঋণ অফার",
    "Unauthorized transaction": "অননুমোদিত লেনদেন",
    "Other": "অন্যান্য",
}


def parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        raise HTTPException(502, "AI returned no structured data")
    return json.loads(m.group(0))


EXTRACT_SYSTEM = (
    "You extract mobile financial service (bKash/Nagad/Rocket, Bangladesh) fraud complaint details. "
    "Input may be Bangla or English. Return ONLY a JSON object with keys: "
    "provider (bKash|Nagad|Rocket|Unknown), trx_id (string, empty if unknown), amount (number, 0 if unknown), "
    "recipient_number (Bangladeshi 11-digit starting 01, empty if unknown), time (string as stated, empty if unknown), "
    f"scam_type (one of: {', '.join(SCAM_BN.keys())}), summary_en (1 sentence), summary_bn (1 sentence Bangla). "
    "Convert Bangla digits to ASCII digits."
)


async def ai_extract_text(text: str) -> dict:
    chat = LlmChat(api_key=LLM_KEY, session_id=f"extract-{uuid.uuid4()}", system_message=EXTRACT_SYSTEM) \
        .with_model("openai", "gpt-5.4-mini")
    resp = await chat.send_message(UserMessage(text=text))
    return parse_json(resp)


async def ai_extract_image(b64: str) -> dict:
    chat = LlmChat(api_key=LLM_KEY, session_id=f"ocr-{uuid.uuid4()}", system_message=EXTRACT_SYSTEM) \
        .with_model("gemini", "gemini-3-flash-preview")
    msg = UserMessage(
        text="This is a screenshot of an MFS transaction SMS/app screen. Read it (OCR) and extract the details.",
        file_contents=[ImageContent(image_base64=b64)],
    )
    resp = await chat.send_message(msg)
    return parse_json(resp)


def clean_extract(d: dict) -> dict:
    scam = d.get("scam_type") if d.get("scam_type") in SCAM_BN else "Other"
    try:
        amount = float(d.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    return {
        "provider": d.get("provider") or "Unknown",
        "trx_id": str(d.get("trx_id") or ""),
        "amount": amount,
        "recipient_number": normalize_number(str(d.get("recipient_number") or "")),
        "time": str(d.get("time") or ""),
        "scam_type": scam,
        "scam_type_bn": SCAM_BN[scam],
        "summary_en": d.get("summary_en") or "",
        "summary_bn": d.get("summary_bn") or "",
    }


def build_drafts(c: ComplaintIn, ref: str):
    en = (
        f"To: {c.provider} Customer Care\nSubject: Fraud complaint – TrxID {c.trx_id or 'N/A'}\n\n"
        f"I am reporting a fraudulent transaction on my {c.provider} account.\n"
        f"• Transaction ID: {c.trx_id or 'N/A'}\n• Amount: Tk {c.amount:,.0f}\n"
        f"• Recipient wallet: {c.recipient_number or 'N/A'}\n• Time: {c.time or 'N/A'}\n"
        f"• Scam type: {c.scam_type}\n\nDetails: {c.description or 'N/A'}\n\n"
        f"I request you to freeze the recipient wallet and reverse the amount. Prohori ref: {ref}"
    )
    bn = (
        f"প্রতি: {c.provider} গ্রাহক সেবা\nবিষয়: প্রতারণার অভিযোগ – TrxID {c.trx_id or 'N/A'}\n\n"
        f"আমার {c.provider} অ্যাকাউন্টে একটি প্রতারণামূলক লেনদেন হয়েছে।\n"
        f"• লেনদেন আইডি: {c.trx_id or 'N/A'}\n• পরিমাণ: ৳{c.amount:,.0f}\n"
        f"• প্রাপকের নম্বর: {c.recipient_number or 'N/A'}\n• সময়: {c.time or 'N/A'}\n"
        f"• প্রতারণার ধরন: {SCAM_BN.get(c.scam_type, c.scam_type)}\n\n"
        f"অনুগ্রহ করে প্রাপকের ওয়ালেট বন্ধ করে টাকা ফেরতের ব্যবস্থা করুন। প্রহরী রেফ: {ref}"
    )
    return en, bn


# ---------------------------------------------------------------- seed
async def seed():
    if await db.transactions.count_documents({}) == 0:
        base = datetime.now(timezone.utc)
        rows = [
            ("bKash", "Received", 2500, "01712345678", "Salary share from Rahim", 1, 0),
            ("bKash", "Payment", 450, "Shwapno Supershop", "", 5, 0),
            ("Nagad", "Send Money", 1000, "01819876543", "Ammu", 20, 0),
            ("bKash", "Cash Out", 3000, "Agent 01911223344", "", 30, 0),
            ("Rocket", "Payment", 820, "DESCO Bill", "", 50, 0),
            ("Nagad", "Received", 1500, "01556677889", "", 70, 0),
        ]
        docs = []
        bal = 12450
        for p, t, a, cp, _, hrs, _s in rows:
            docs.append(Transaction(
                provider=p, type=t, amount=a, counterparty=cp,
                trx_id=f"{p[:1].upper()}{random.randint(10**8, 10**9 - 1)}X",
                time=(base - timedelta(hours=hrs)).isoformat(), balance=bal,
            ).to_mongo())
        await db.transactions.insert_many(docs)
    if await db.fraud_numbers.count_documents({}) == 0:
        seeds = [
            ("01798765432", 14, ["bKash", "Nagad"], ["Fake prize / lottery", "Impersonation (agent/provider)"], True),
            ("01634567890", 9, ["bKash"], ["Wrong send / refund trick"], True),
            ("01987654321", 6, ["Nagad", "Rocket"], ["OTP / PIN phishing"], True),
            ("01555123456", 2, ["bKash"], ["Fake job / loan offer"], False),
            ("01876543210", 1, ["Rocket"], ["Wrong send / refund trick"], False),
        ]
        await db.fraud_numbers.insert_many([
            FraudNumber(number=n, report_count=c, providers=p, scam_types=s,
                        last_reported=(datetime.now(timezone.utc) - timedelta(hours=random.randint(2, 60))).isoformat(),
                        flagged_high_risk=f).to_mongo() for n, c, p, s, f in seeds
        ])
    if await db.community_reports.count_documents({}) == 0:
        areas = ["Mirpur, Dhaka", "Chattogram", "Sylhet", "Rajshahi", "Khulna", "Gazipur", "Cumilla", "Uttara, Dhaka"]
        nums = ["01798765432", "01634567890", "01987654321", "01555123456", "01798765432", "01634567890",
                "01876543210", "01798765432"]
        scams = list(SCAM_BN.keys())[:6]
        docs = []
        for i, n in enumerate(nums):
            s = scams[i % len(scams)]
            docs.append(CommunityReport(
                masked_number=mask(n), provider=["bKash", "Nagad", "Rocket"][i % 3], scam_type=s,
                scam_type_bn=SCAM_BN[s], amount=random.choice([1500, 3000, 5000, 8500, 12000, 2200]),
                area=areas[i], time=(datetime.now(timezone.utc) - timedelta(hours=i * 5 + 1)).isoformat(),
            ).to_mongo())
        await db.community_reports.insert_many(docs)


class SellerProfile(BaseDocument):
    number: str
    business_name: str
    fb_page_name: str = ""
    fb_page_url: str = ""
    category: str = ""
    verified: bool = False
    account_age_months: int = 0
    successful_deals: int = 0
    positive: int = 0
    negative: int = 0
    created_at: str = Field(default_factory=now_iso)


class MyProfile(BaseDocument):
    key: str = "me"
    name: str
    phone: str
    account_type: str = "personal"  # personal | business
    business_name: str = ""
    fb_page_url: str = ""
    category: str = ""
    wallets: List[str] = []
    verification: dict = Field(default_factory=lambda: {"wallet_otp": False, "nid": False, "fb_page": False})


class ProfileIn(BaseModel):
    name: str
    account_type: str
    business_name: str = ""
    fb_page_url: str = ""
    category: str = ""


class VerifyIn(BaseModel):
    step: str  # wallet_otp | nid | fb_page


class FeedbackIn(BaseModel):
    outcome: str  # delivered | not_delivered


VERIFY_STEPS = ["wallet_otp", "nid", "fb_page"]


def page_name_from_url(url: str) -> str:
    u = re.sub(r"^https?://", "", (url or "").strip()).rstrip("/")
    return u.split("/")[-1] if "/" in u else u


def trust_of(s: SellerProfile, fraud_count: int) -> dict:
    score = 40 + (30 if s.verified else 0)
    score += min(15, s.successful_deals // 20) + min(10, s.account_age_months // 6)
    fb = s.positive + s.negative
    if fb:
        score += int(15 * s.positive / fb) - 7
    score -= min(30, s.negative * 3) + fraud_count * 8
    score = max(0, min(100, score))
    if fraud_count >= 3 or score < 40:
        level = "risky"
    elif score >= 75 and fraud_count == 0:
        level = "trusted"
    else:
        level = "neutral"
    rating = round(1 + 4 * s.positive / fb, 1) if fb else None
    return {**s.model_dump(), "trust_score": score, "trust_level": level, "rating": rating, "fraud_reports": fraud_count}


async def seller_view(s: SellerProfile) -> dict:
    f = await db.fraud_numbers.find_one({"number": s.number})
    return trust_of(s, f["report_count"] if f else 0)


async def seed_sellers():
    if await db.seller_profiles.count_documents({}) == 0:
        rows = [
            ("01712345678", "Dhaka Deshi Fashion", "facebook.com/dhakadeshifashion", "Clothing", True, 38, 312, 298, 6),
            ("01822334455", "Homemade Pitha Ghor", "facebook.com/pithaghor.bd", "Food", True, 20, 96, 91, 2),
            ("01555123456", "Gadget Hut BD", "facebook.com/gadgethutbd", "Electronics", False, 4, 18, 9, 7),
            ("01798765432", "Lucky Offer BD", "facebook.com/luckyoffer.bd.official", "Giveaway", False, 1, 0, 0, 11),
        ]
        await db.seller_profiles.insert_many([
            SellerProfile(number=n, business_name=b, fb_page_url=u, fb_page_name=page_name_from_url(u), category=c,
                          verified=v, account_age_months=a, successful_deals=d, positive=p, negative=neg).to_mongo()
            for n, b, u, c, v, a, d, p, neg in rows
        ])
    if await db.profile.count_documents({"key": "me"}) == 0:
        await db.profile.insert_one(MyProfile(name="Rahima Akter", phone="01911556677", wallets=["bKash", "Nagad"]).to_mongo())


@app.on_event("startup")
async def on_start():
    await seed()
    await seed_sellers()


# ---------------------------------------------------------------- routes
@api_router.get("/")
async def root():
    return {"message": "Prohori API"}


@api_router.get("/stats")
async def stats():
    return {
        "monitored": await db.transactions.count_documents({}),
        "alerts": await db.transactions.count_documents({"suspicious": True}),
        "reports_pool": sum([d["report_count"] async for d in db.fraud_numbers.find({}, {"report_count": 1})]),
        "high_risk_wallets": await db.fraud_numbers.count_documents({"flagged_high_risk": True}),
        "complaints": await db.complaints.count_documents({}),
    }


@api_router.get("/transactions", response_model=List[Transaction])
async def list_transactions():
    docs = await db.transactions.find().sort("time", -1).to_list(100)
    return [Transaction.from_mongo(d) for d in docs]


@api_router.get("/transactions/{tid}", response_model=Transaction)
async def get_transaction(tid: str):
    if not ObjectId.is_valid(tid):
        raise HTTPException(404, "Not found")
    d = await db.transactions.find_one({"_id": ObjectId(tid)})
    if not d:
        raise HTTPException(404, "Not found")
    return Transaction.from_mongo(d)


@api_router.post("/simulate-sms", response_model=Transaction)
async def simulate_sms():
    """Simulates an incoming MFS SMS that deviates from the user's usual pattern."""
    number = random.choice(["01798765432", "01634567890", "01987654321"])
    amount = random.choice([6500, 8500, 9500])
    trx = f"B{random.randint(10**8, 10**9 - 1)}K"
    t = datetime.now(timezone.utc)
    txn = Transaction(
        provider="bKash", type="Send Money", amount=amount, counterparty=number, trx_id=trx,
        time=t.isoformat(), balance=round(12450 - amount, 2), suspicious=True, risk_score=random.randint(86, 97),
        reasons_en=[f"Amount is {round(amount / 1100, 1)}x your usual transfer (Tk 1,100)",
                    "New recipient never seen before", "Sent at 2:14 AM, outside your usual hours",
                    "Recipient reported by others in the shared pool"],
        reasons_bn=["আপনার স্বাভাবিক লেনদেনের চেয়ে অনেক বেশি টাকা", "নতুন অপরিচিত প্রাপক",
                    "রাত ২:১৪ — আপনার স্বাভাবিক সময়ের বাইরে", "অন্যরা এই নম্বরটি রিপোর্ট করেছেন"],
        status="pending_review",
        sms=f"You have sent Tk {amount:,.2f} to {number} successfully. Fee Tk 0.00. Balance Tk {12450 - amount:,.2f}. TrxID {trx} at {t.strftime('%d/%m/%Y %H:%M')}",
    )
    res = await db.transactions.insert_one(txn.to_mongo())
    txn.id = str(res.inserted_id)
    return txn


@api_router.post("/transactions/{tid}/confirm", response_model=Transaction)
async def confirm_mine(tid: str):
    if not ObjectId.is_valid(tid):
        raise HTTPException(404, "Not found")
    await db.transactions.update_one({"_id": ObjectId(tid)}, {"$set": {"status": "confirmed_mine"}})
    return await get_transaction(tid)


@api_router.post("/number-check")
async def number_check(body: NumberCheckIn):
    n = normalize_number(body.number)
    if not re.fullmatch(r"01[3-9]\d{8}", n):
        raise HTTPException(400, "Enter a valid 11-digit Bangladeshi mobile number")
    d = await db.fraud_numbers.find_one({"number": n})
    sd = await db.seller_profiles.find_one({"number": n})
    seller = await seller_view(SellerProfile.from_mongo(sd)) if sd else None
    if not d:
        return {"number": n, "level": "safe", "report_count": 0, "providers": [], "scam_types": [],
                "scam_types_bn": [], "flagged_high_risk": False, "last_reported": None, "seller": seller}
    f = FraudNumber.from_mongo(d)
    level = "reported" if f.report_count >= 3 else "caution"
    return {"number": n, "level": level, "report_count": f.report_count, "providers": f.providers,
            "scam_types": f.scam_types, "scam_types_bn": [SCAM_BN.get(s, s) for s in f.scam_types],
            "flagged_high_risk": f.flagged_high_risk, "last_reported": f.last_reported, "seller": seller}


@api_router.get("/reports", response_model=List[CommunityReport])
async def reports():
    docs = await db.community_reports.find().sort("time", -1).to_list(100)
    return [CommunityReport.from_mongo(d) for d in docs]


@api_router.get("/high-risk")
async def high_risk():
    docs = await db.fraud_numbers.find({"flagged_high_risk": True}).sort("report_count", -1).to_list(50)
    return [{"masked_number": mask(d["number"]), "report_count": d["report_count"], "providers": d["providers"]}
            for d in docs]


@api_router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    data = await audio.read()
    if len(data) < 2000:
        raise HTTPException(400, "Recording too short, please try again")
    suffix = Path(audio.filename or "rec.m4a").suffix or ".m4a"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        stt = OpenAISpeechToText(api_key=LLM_KEY)
        with open(path, "rb") as f:
            resp = await stt.transcribe(file=f, model="gpt-4o-mini-transcribe", response_format="json",
                                        language="bn", prompt="বিকাশ, নগদ, রকেট, টাকা, ট্রানজেকশন আইডি, প্রতারণা")
        return {"text": (resp.text or "").strip()}
    except Exception as e:
        logger.exception("transcribe failed")
        raise HTTPException(502, f"Transcription failed: {e}")
    finally:
        os.unlink(path)


BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def demo_extract(text: str) -> dict:
    """Offline rule-based parser used when the AI service is unavailable (prototype demo mode)."""
    t = (text or "").translate(BN_DIGITS)
    low = t.lower()
    provider = "Nagad" if ("nagad" in low or "নগদ" in t) else "Rocket" if ("rocket" in low or "রকেট" in t) else "bKash"
    num = re.search(r"(?:\+?88)?01[3-9]\d{8}", re.sub(r"[\s-]", "", t))
    trx = re.search(r"\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,12}\b", t)
    amt = re.search(r"(?:tk|৳|taka)?\s?(\d{3,6})(?:\s?(?:tk|taka|টাকা))", t, re.I) or re.search(r"(?:tk|৳)\s?(\d{3,6})", t, re.I)
    scam = "Unauthorized transaction"
    for kw, s in [(("lottery", "prize", "লটারি", "পুরস্কার"), "Fake prize / lottery"),
                  (("otp", "pin", "পিন", "ওটিপি"), "OTP / PIN phishing"),
                  (("wrong", "refund", "ভুল", "ফেরত"), "Wrong send / refund trick"),
                  (("agent", "customer care", "এজেন্ট", "কাস্টমার"), "Impersonation (agent/provider)"),
                  (("job", "loan", "চাকরি", "ঋণ"), "Fake job / loan offer")]:
        if any(k in low or k in t for k in kw):
            scam = s
            break
    return {"provider": provider, "trx_id": trx.group(0) if trx else "", "amount": float(amt.group(1)) if amt else 0,
            "recipient_number": num.group(0) if num else "", "time": "", "scam_type": scam,
            "summary_en": f"User reports a {scam.lower()} on {provider}.",
            "summary_bn": f"{provider} অ্যাকাউন্টে {SCAM_BN[scam]} এর অভিযোগ।"}


DEMO_SCREENSHOT = {"provider": "bKash", "trx_id": "BKD8H27X9Q", "amount": 8500, "recipient_number": "01798765432",
                   "time": "Today 02:14 AM", "scam_type": "Fake prize / lottery",
                   "summary_en": "Tk 8,500 sent to an unknown number after a fake lottery call.",
                   "summary_bn": "ভুয়া লটারির ফোনের পর অপরিচিত নম্বরে ৮,৫০০ টাকা পাঠানো হয়েছে।"}


@api_router.post("/extract/text")
async def extract_text(body: ExtractTextIn):
    if not body.text.strip():
        raise HTTPException(400, "Please describe what happened")
    try:
        return {**clean_extract(await ai_extract_text(body.text)), "ai": True}
    except Exception:
        logger.exception("extract text failed, using demo parser")
        return {**clean_extract(demo_extract(body.text)), "ai": False}


@api_router.post("/extract/image")
async def extract_image(body: ExtractImageIn):
    b64 = body.image_base64.split(",")[-1]
    try:
        return {**clean_extract(await ai_extract_image(b64)), "ai": True}
    except Exception:
        logger.exception("extract image failed, using demo sample")
        return {**clean_extract(DEMO_SCREENSHOT), "ai": False}


@api_router.post("/tts")
async def tts(body: TtsIn):
    text = re.sub(r"\s+", " ", body.text).strip()[:4000]
    if not text:
        raise HTTPException(400, "No text")
    instructions = "Speak clearly and calmly in Bangla, like a trusted bank safety officer. Moderate pace."
    key = hashlib.sha256(f"{text}|coral|gpt-4o-mini-tts|mp3|{instructions}".encode()).hexdigest()[:32]
    path = TTS_DIR / f"{key}.mp3"
    if not path.exists():
        try:
            t = OpenAITextToSpeech(api_key=LLM_KEY)
            audio = await t.generate_speech(text=text, model="gpt-4o-mini-tts", voice="coral",
                                            instructions=instructions, response_format="mp3")
        except Exception as e:
            logger.exception("tts failed")
            raise HTTPException(502, f"Voice generation failed: {e}")
        path.write_bytes(audio)
    return {"url": f"/api/tts/{key}.mp3"}


@api_router.get("/tts/{key}.mp3")
async def get_tts(key: str):
    path = TTS_DIR / f"{re.sub(r'[^a-f0-9]', '', key)}.mp3"
    if not path.exists():
        raise HTTPException(404, "Not found")
    return Response(content=path.read_bytes(), media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=31536000"})


@api_router.post("/complaints", response_model=Complaint)
async def create_complaint(body: ComplaintIn):
    ref = f"PRH-{datetime.now(timezone.utc).strftime('%y%m%d')}-{random.randint(1000, 9999)}"
    en, bn = build_drafts(body, ref)
    c = Complaint(provider=body.provider, trx_id=body.trx_id, amount=body.amount,
                  recipient_number=normalize_number(body.recipient_number), time=body.time,
                  scam_type=body.scam_type, description=body.description, draft_en=en, draft_bn=bn,
                  reference=ref, transaction_id=body.transaction_id)
    res = await db.complaints.insert_one(c.to_mongo())
    c.id = str(res.inserted_id)
    # Pool anonymized report
    if c.recipient_number:
        existing = await db.fraud_numbers.find_one({"number": c.recipient_number})
        if existing:
            cnt = existing["report_count"] + 1
            await db.fraud_numbers.update_one({"_id": existing["_id"]}, {
                "$set": {"report_count": cnt, "last_reported": now_iso(), "flagged_high_risk": cnt >= 3},
                "$addToSet": {"providers": c.provider, "scam_types": c.scam_type}})
        else:
            await db.fraud_numbers.insert_one(FraudNumber(
                number=c.recipient_number, report_count=1, providers=[c.provider], scam_types=[c.scam_type],
                last_reported=now_iso()).to_mongo())
        await db.community_reports.insert_one(CommunityReport(
            masked_number=mask(c.recipient_number), provider=c.provider, scam_type=c.scam_type,
            scam_type_bn=SCAM_BN.get(c.scam_type, c.scam_type), amount=c.amount, area="Near you",
            time=now_iso()).to_mongo())
    if body.transaction_id and ObjectId.is_valid(body.transaction_id):
        await db.transactions.update_one({"_id": ObjectId(body.transaction_id)}, {"$set": {"status": "reported"}})
    return c


@api_router.get("/complaints", response_model=List[Complaint])
async def list_complaints():
    docs = await db.complaints.find().sort("created_at", -1).to_list(100)
    return [Complaint.from_mongo(d) for d in docs]


@api_router.post("/reset-demo")
async def reset_demo():
    for col in ["transactions", "fraud_numbers", "community_reports", "complaints", "seller_profiles", "profile"]:
        await db[col].delete_many({})
    await seed()
    await seed_sellers()
    return {"ok": True}


# ---------------------------------------------------------------- seller trust
@api_router.get("/seller/lookup")
async def seller_lookup(q: str):
    q = (q or "").strip()
    if len(q) < 3:
        raise HTTPException(400, "Enter a number or Facebook page name")
    n = normalize_number(q)
    if re.fullmatch(r"01[3-9]\d{8}", n):
        d = await db.seller_profiles.find_one({"number": n})
    else:
        term = re.escape(page_name_from_url(q).replace("-", " ").strip())
        d = await db.seller_profiles.find_one({"$or": [
            {"business_name": {"$regex": term, "$options": "i"}},
            {"fb_page_url": {"$regex": term, "$options": "i"}},
            {"fb_page_name": {"$regex": term, "$options": "i"}},
        ]})
    return {"query": q, "seller": await seller_view(SellerProfile.from_mongo(d)) if d else None}


@api_router.post("/seller/{number}/feedback")
async def seller_feedback(number: str, body: FeedbackIn):
    if body.outcome not in ("delivered", "not_delivered"):
        raise HTTPException(400, "Invalid outcome")
    n = normalize_number(number)
    inc = {"positive": 1, "successful_deals": 1} if body.outcome == "delivered" else {"negative": 1}
    res = await db.seller_profiles.find_one_and_update({"number": n}, {"$inc": inc}, return_document=True)
    if not res:
        raise HTTPException(404, "Seller not found")
    return await seller_view(SellerProfile.from_mongo(res))


# ---------------------------------------------------------------- my profile
async def get_me() -> MyProfile:
    d = await db.profile.find_one({"key": "me"})
    if not d:
        await seed_sellers()
        d = await db.profile.find_one({"key": "me"})
    return MyProfile.from_mongo(d)


async def profile_view(p: MyProfile) -> dict:
    verified = p.account_type == "business" and all(p.verification.get(s) for s in VERIFY_STEPS)
    seller = None
    if p.account_type == "business":
        d = await db.seller_profiles.find_one({"number": p.phone})
        if d:
            seller = await seller_view(SellerProfile.from_mongo(d))
    return {**p.model_dump(), "verified": verified, "seller": seller}


async def sync_seller(p: MyProfile):
    if p.account_type != "business" or not p.business_name:
        await db.seller_profiles.delete_one({"number": p.phone})
        return
    verified = all(p.verification.get(s) for s in VERIFY_STEPS)
    await db.seller_profiles.update_one(
        {"number": p.phone},
        {"$set": {"business_name": p.business_name, "fb_page_url": p.fb_page_url,
                  "fb_page_name": page_name_from_url(p.fb_page_url), "category": p.category, "verified": verified},
         "$setOnInsert": {"account_age_months": 14, "successful_deals": 0, "positive": 0, "negative": 0,
                          "created_at": now_iso()}},
        upsert=True,
    )


@api_router.get("/profile")
async def read_profile():
    return await profile_view(await get_me())


@api_router.put("/profile")
async def update_profile(body: ProfileIn):
    if body.account_type not in ("personal", "business"):
        raise HTTPException(400, "Invalid account type")
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    if body.account_type == "business" and not body.business_name.strip():
        raise HTTPException(400, "Business / page name is required")
    await db.profile.update_one({"key": "me"}, {"$set": body.model_dump()})
    p = await get_me()
    await sync_seller(p)
    return await profile_view(p)


@api_router.post("/profile/verify")
async def verify_step(body: VerifyIn):
    if body.step not in VERIFY_STEPS:
        raise HTTPException(400, "Invalid step")
    p = await get_me()
    if body.step == "fb_page" and not p.fb_page_url:
        raise HTTPException(400, "Add your Facebook page link first")
    await db.profile.update_one({"key": "me"}, {"$set": {f"verification.{body.step}": True}})
    p = await get_me()
    await sync_seller(p)
    return await profile_view(p)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
