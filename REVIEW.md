# Review queue

Things the registry contains or lacks that a human (or a later session with web search) must verify.
Delete a line once it is resolved. Generated logo gaps live in `LOGOS-TODO.md` (`node scripts/logos/report.mjs`).

## Unverified — added from general knowledge, not from a source found on 2026-10-20

The research agents ran out of web searches and flagged these. Confirm with a source or remove.

- **Aliases**: Barclays → Absa (KE, MU, MZ, SC, ZM, ZW); Orient Bank → I&M Uganda; Lion International Bank →
  Anbesa Bank; United Bank → Hibret Bank; BancABC → Access Bank Tanzania; Habib African Bank → Africa and
  Gulf Bank; BFV-SG, Banque Nationale pour l'Industrie, Telma (MG); First Merchant Bank, Opportunity Bank
  Malawi, MyBucks Banking Corporation, New Building Society, Stanbic Malawi, Telekom Networks Malawi (MW);
  MPCB, Banque Populaire Mauritius, Emtel Cash (MU); Banco Único, mCel (MZ); BMI Offshore Bank (SC); Atlas
  Mara Zambia, Cavmont Bank, Zamkwacha (ZM); MBCA, Metropolitan Bank of Zimbabwe, Zimbabwe Banking
  Corporation (ZW); Global Bank Liberia → Bloom Bank (LR); BFI full name (MR); Banco de Fomento
  Internacional (CV); Tigo Cash on Moov Money (TD); Pata Biani → Telecel Money (CF); Flooz ↔ Moov Money
  (BJ, BF, CI, TG); TouchPay, RCPB, SGBF, SGSN, SGCI (UEMOA).
- **Groups**: KCB on BPR Bank Rwanda; Absa on NBC Tanzania; Banque Centrale Populaire on Banque Atlantique
  outside Togo; Oragroup on Orabank; Attijariwafa on SIB and Wafacash; Standard Bank on Stanbic; GTCO,
  FirstBank, Orange, Société Générale, Afriland First Group, Bank of Africa (LCB, CG), Centenary Group,
  Groupe BCP, Millennium bcp, FirstRand, Banco BiG, Vista, ASA International and other groups inferred
  from brand names.

## Coverage gaps — no official list could be read

- **Banks**: TD, GQ, GA (COBAC register offline), MR (central bank page "en cours de finalisation"), ER,
  ZW (central bank blocks automated access; 2024 PDF used).
- **Mobile money**: TZ, SO, SS, MW, KM, MU, SZ, NA (no public e-money register).
- **Microfinance**: BJ, BF, GW, ML, NE, SN (large institutions only), NA, SZ, MW, EG, TZ (5 of ~3,000),
  UG (UMRA register not included). Each file's `coverage` is the authority.
- **South Sudan** mobile money and the Digitel wallet were cut short by the search budget.

## De-facto foreign currencies (not in CLDR legal tender)

`data/currencies.json` lists legal tender only. Sourced so far:

- **LR** — US dollar is legal tender alongside LRD (CBL Act 1999 s.19.2): add USD to Liberia.
- **ZW** — already lists ZWG + USD.
- **NA, LS** — rand already listed. **SZ** — rand circulates 1:1; legal status disputed.

To source: USD in SO, SS, CD; anything for KM, MG, MW, MU, MZ, SC, ZM, CV, and the UEMOA/CEMAC zones.

## Rebrands to double-check in the app copy

T-Money → Mixx by Yas (TG), Free Money → Mixx by Yas (SN), Tigo Pesa → Mixx by Yas (TZ), MTN MoMo →
Telecel Cash (GW), Orange Money → Zamani Cash (NE), TymeBank → GoTyme Bank (ZA), Société Générale →
General Bank of Cameroon (CM), BICIG → AFG Bank Gabon (GA), Société Générale Tchad → Coris Bank
International Tchad (TD), Etisalat Cash → e& Cash (EG).

## Data duplicates

- **GN** — "Vista Bank Guinée" and "Vista Gui" are the same bank listed twice; keep one (found by `scripts/logos/audit-brands.mjs`).
