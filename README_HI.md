# Pallavi Digital Media — Website Package

यह एक शुरुआती full-stack Artist Portal है। इसे Node.js वाले लैपटॉप/कंप्यूटर पर चलाएँ।

## शामिल सुविधाएँ
- Artist registration, login/logout
- Song metadata, audio और cover artwork submission
- Admin release review: Pending / Approved / Rejected
- Content ID eligibility/rights request workflow
- Admin-entered royalty statements और artist royalty view
- UPI / bank transfer payout request workflow; admin status tracking
- SQLite database, hashed passwords, sessions, CSRF checks, file-size/type checks

## बहुत जरूरी सीमा
यह वेबसाइट अभी Spotify, Apple Music, JioSaavn या YouTube Music पर वास्तविक music delivery नहीं करती। Content ID access नहीं देती। Royalty amounts अपने-आप नहीं निकालती और पैसे अपने-आप ट्रांसफर नहीं करती। इसके लिए authorized music distributor / label partner, contracts, approved APIs, verified statements और payment provider integration जरूरी है। “Approved” का मतलब सिर्फ internal admin approval है।

## Laptop पर चलाने का तरीका
1. Node.js 20 या नया संस्करण install करें: https://nodejs.org/
2. ZIP extract करें और इस folder में terminal / Command Prompt खोलें।
3. `.env.example` की copy बनाकर उसका नाम `.env` रखें।
4. `.env` में `ADMIN_PASSWORD` और `SESSION_SECRET` बदलें। Admin password कम-से-कम 12 अक्षर का रखें; session secret लंबा random value रखें।
5. चलाएँ:
   ```bash
   npm install
   npm start
   ```
6. Browser में `http://localhost:3000` खोलें।
7. Admin email/password `.env` की `ADMIN_EMAIL` और `ADMIN_PASSWORD` values होंगी। पहली बार start होने पर admin account बनता है।

## Online करने से पहले
- HTTPS-enabled hosting, production database/file storage, automatic backups, rate limiting, email verification/password reset, audit logs, malware/file-signature scanning, privacy policy, terms, copyright warranties and data retention policy जोड़ें।
- Public hosting से पहले security review कराएँ।
- Artist payout details sensitive हैं; केवल जरूरी जानकारी लें और उन्हें सुरक्षित रखें। कभी भी passwords, OTP, card PIN या banking login न लें।
- Production में external music distribution API को तभी जोड़ें जब partner से written authorization और API credentials मिलें।
- यह starter है, audited production SaaS नहीं।
