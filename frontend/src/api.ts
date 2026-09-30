import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";

export const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

export type Transaction = {
  id: string;
  provider: string;
  type: string;
  amount: number;
  counterparty: string;
  trx_id: string;
  time: string;
  balance: number;
  suspicious: boolean;
  risk_score: number;
  reasons_en: string[];
  reasons_bn: string[];
  status: "normal" | "pending_review" | "confirmed_mine" | "reported";
  sms: string;
};

export type Extracted = {
  provider: string;
  trx_id: string;
  amount: number;
  recipient_number: string;
  time: string;
  scam_type: string;
  scam_type_bn: string;
  summary_en: string;
  summary_bn: string;
  ai?: boolean;
};

export type NumberCheck = {
  number: string;
  level: "safe" | "caution" | "reported";
  report_count: number;
  providers: string[];
  scam_types: string[];
  scam_types_bn: string[];
  flagged_high_risk: boolean;
  last_reported: string | null;
  seller: Seller | null;
};

export type Seller = {
  number: string;
  business_name: string;
  fb_page_name: string;
  fb_page_url: string;
  category: string;
  verified: boolean;
  account_age_months: number;
  successful_deals: number;
  positive: number;
  negative: number;
  trust_score: number;
  trust_level: "trusted" | "neutral" | "risky";
  rating: number | null;
  fraud_reports: number;
};

export type MyProfile = {
  name: string;
  phone: string;
  account_type: "personal" | "business";
  business_name: string;
  fb_page_url: string;
  category: string;
  wallets: string[];
  verification: { wallet_otp: boolean; nid: boolean; fb_page: boolean };
  verified: boolean;
  seller: Seller | null;
};

export type CommunityReport = {
  id: string;
  masked_number: string;
  provider: string;
  scam_type: string;
  scam_type_bn: string;
  amount: number;
  area: string;
  time: string;
};

export type Complaint = {
  id: string;
  provider: string;
  trx_id: string;
  amount: number;
  recipient_number: string;
  time: string;
  scam_type: string;
  description: string;
  draft_en: string;
  draft_bn: string;
  reference: string;
  created_at: string;
};

export type Stats = {
  monitored: number;
  alerts: number;
  reports_pool: number;
  high_risk_wallets: number;
  complaints: number;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Request failed (${res.status})`);
  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  stats: () => req<Stats>("/stats"),
  transactions: () => req<Transaction[]>("/transactions"),
  transaction: (id: string) => req<Transaction>(`/transactions/${id}`),
  simulateSms: () => post<Transaction>("/simulate-sms"),
  confirmMine: (id: string) => post<Transaction>(`/transactions/${id}/confirm`),
  checkNumber: (number: string) => post<NumberCheck>("/number-check", { number }),
  reports: () => req<CommunityReport[]>("/reports"),
  highRisk: () =>
    req<{ masked_number: string; report_count: number; providers: string[] }[]>("/high-risk"),
  extractText: (text: string) => post<Extracted>("/extract/text", { text }),
  extractImage: (image_base64: string) => post<Extracted>("/extract/image", { image_base64 }),
  tts: (text: string) => post<{ url: string }>("/tts", { text }),
  complaints: () => req<Complaint[]>("/complaints"),
  createComplaint: (body: Record<string, unknown>) => post<Complaint>("/complaints", body),
  resetDemo: () => post<{ ok: boolean }>("/reset-demo"),
  sellerLookup: (q: string) => req<{ query: string; seller: Seller | null }>(`/seller/lookup?q=${encodeURIComponent(q)}`),
  sellerFeedback: (number: string, outcome: "delivered" | "not_delivered") =>
    post<Seller>(`/seller/${number}/feedback`, { outcome }),
  profile: () => req<MyProfile>("/profile"),
  updateProfile: (body: Pick<MyProfile, "name" | "account_type" | "business_name" | "fb_page_url" | "category">) =>
    req<MyProfile>("/profile", { method: "PUT", body: JSON.stringify(body) }),
  verifyStep: (step: "wallet_otp" | "nid" | "fb_page") => post<MyProfile>("/profile/verify", { step }),
  async transcribe(uri: string): Promise<string> {
    const form = new FormData();
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("audio", blob, "recording.webm");
      const res = await fetch(`${BASE}/api/transcribe`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Transcription failed");
      return data.text;
    }
    form.append("audio", new File(uri) as any, "recording.m4a");
    const res = await expoFetch(`${BASE}/api/transcribe`, { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.detail || "Transcription failed");
    return data.text;
  },
};

export const SCAM_TYPES: { en: string; bn: string }[] = [
  { en: "Fake prize / lottery", bn: "ভুয়া লটারি / পুরস্কার" },
  { en: "Impersonation (agent/provider)", bn: "এজেন্ট/কোম্পানি সেজে প্রতারণা" },
  { en: "Wrong send / refund trick", bn: "ভুল পাঠানো / ফেরত প্রতারণা" },
  { en: "OTP / PIN phishing", bn: "ওটিপি / পিন ফিশিং" },
  { en: "Fake job / loan offer", bn: "ভুয়া চাকরি / ঋণ অফার" },
  { en: "Unauthorized transaction", bn: "অননুমোদিত লেনদেন" },
  { en: "Other", bn: "অন্যান্য" },
];

export const PROVIDERS = ["bKash", "Nagad", "Rocket"];

const BN = "০১২৩৪৫৬৭৮৯";
export const toBn = (s: string | number) => String(s).replace(/\d/g, (d) => BN[Number(d)]);
export const taka = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

export function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}
