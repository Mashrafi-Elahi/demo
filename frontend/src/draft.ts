// In-memory complaint draft shared between the complaint screens.
export type Draft = {
  transactionId?: string;
  provider: string;
  trx_id: string;
  amount: string;
  recipient_number: string;
  time: string;
  scam_type: string;
  description: string;
  summary_bn?: string;
  summary_en?: string;
  ai?: boolean;
};

const empty: Draft = {
  provider: "bKash",
  trx_id: "",
  amount: "",
  recipient_number: "",
  time: "",
  scam_type: "Unauthorized transaction",
  description: "",
};

let current: Draft = { ...empty };

export const draftStore = {
  get: () => current,
  reset: (init?: Partial<Draft>) => {
    current = { ...empty, ...init };
  },
  merge: (patch: Partial<Draft>) => {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== "" && v !== undefined && v !== null),
    );
    current = { ...current, ...clean };
  },
};
