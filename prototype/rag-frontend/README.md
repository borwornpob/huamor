# RAG Frontend

หน้า frontend สำหรับทดสอบ `rag-backend` (login + chat start + chat message) อย่างรวดเร็ว

## 1) Run backend ก่อน

ที่โฟลเดอร์ `prototype/rag-backend`

```bash
pnpm install
cp .env.example .env
pnpm dev
```

เช็กว่า backend พร้อม:

`http://localhost:8787/health`

## 2) Run frontend

ที่โฟลเดอร์ `prototype/rag-frontend`

```bash
npm install
copy .env.example .env.local
npm run dev
```

เปิด:

`http://localhost:3000`

## 3) วิธีเช็กผลในหน้า UI

1. กด Login (ค่า default: `patient1` / `patient123`)
2. พิมพ์อาการ แล้วกด Start Chat
3. พิมพ์ข้อความต่อ แล้วกด Send Message
4. ดูผลลัพธ์ JSON จริงในกล่อง `Raw API Response`

## 4) สร้าง Next.js app ใหม่ (กรณีเริ่มโปรเจกต์ใหม่)

```bash
npx create-next-app@latest rag-frontend --ts --app
```

หรือใช้ npm init:

```bash
npm create next-app@latest rag-frontend -- --ts --app
```
