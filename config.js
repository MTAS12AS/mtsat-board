// ตั้งค่าหน้าเว็บ — แก้ 2 ค่านี้หลัง deploy API และสร้าง OAuth client
window.MTSAT_CONFIG = {
  // Web app URL ของ Apps Script (Deploy → Manage deployments) ลงท้ายด้วย /exec
  API_URL: 'https://script.google.com/macros/s/AKfycbyKIbgotC_ProDMh5OHUuw1w5XBUIQQI6YL2VXsuxQ31quqEjVnvvVQ_1A9mH9Gz_1P/exec',
  // OAuth Client ID จาก Google Cloud (ค่าเดียวกับ GOOGLE_CLIENT_ID ในแท็บ Settings)
  CLIENT_ID: '439505194802-258nk7mm90pkjfg98sd7r4olema80jib.apps.googleusercontent.com',
};
