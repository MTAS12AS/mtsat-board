# MTSAT Open House Board — หน้าเว็บ

หน้าเว็บของระบบจัดการงาน MTSAT Open House ข้อมูลทั้งหมดอยู่ใน Google Sheets ส่วนการอ่าน/เขียนผ่าน Apps Script API
ไฟล์ใน repo นี้มีแค่หน้าเว็บ ไม่มีข้อมูลงานหรือข้อมูลส่วนตัวของใคร

## ไฟล์
- `index.html` หน้าเดียวของแอป
- `app.js` โค้ดทั้งหมด (ไม่มีขั้น build แก้แล้ว commit ได้เลย)
- `app.css` หน้าตา
- `config.js` ค่าที่ต้องตั้ง: `API_URL` (Web app URL ของ Apps Script) และ `CLIENT_ID` (Google Sign-In)

## เปิดใช้งานบน GitHub Pages
Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save
เว็บจะอยู่ที่ `https://<ชื่อบัญชี>.github.io/mtsat-board/`

## ส่งต่อรุ่น
1. Settings → Transfer ownership ไปบัญชีของรุ่นถัดไป (ลิงก์จะเปลี่ยนตามชื่อบัญชีใหม่)
2. เพิ่ม origin ใหม่ใน Google Cloud → Clients → Authorized JavaScript origins
