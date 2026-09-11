# SQS Audio/Miracast Fix

แก้ระบบเสียงสำหรับ Windows -> TV ผ่าน Wireless Display / Miracast

## จุดที่แก้
- ไม่เล่น MP3 ซ้ำ 2 รอบ
- Server ดาวน์โหลด MP3 ให้เสร็จทั้งไฟล์ก่อนส่ง event
- เปลี่ยนชื่อไฟล์ให้ไม่ชนกัน
- เพิ่ม server-side announcement queue
- Client โหลด MP3 ให้ครบก่อน decode
- ใช้ Web Audio API / AudioBufferSourceNode แทน `<audio>.play()`
- มี client-side audio queue ป้องกันเสียงซ้อน
- preload เสียงถัดไปได้ระหว่างเสียงปัจจุบันกำลังเล่น
- เพิ่ม reconnect Socket.IO
- เพิ่มเวลาเก็บไฟล์เสียงจาก 30 วินาทีเป็น 5 นาที
- ตั้ง HTTP cache และ Accept-Ranges สำหรับไฟล์เสียง
- restore queue counter จาก queue.json หลัง restart

## การทดสอบ
1. เปิด Windows แล้วเชื่อม TV ด้วย Wireless Display / Miracast
2. ตั้ง TV/Miracast เป็น Output เสียงของ Windows
3. เปิด `/display.html`
4. กด "🔊 เปิดเสียง" 1 ครั้ง
5. ทดลองเรียกคิวหลายคิวติดกัน

หมายเหตุ:
หากยังมีอาการเสียงกระตุกทั้งที่ไฟล์เสียงเล่นจาก AudioBuffer ได้แล้ว
แต่เสียงจากทุกโปรแกรมใน Windows ยังกระตุกด้วย แสดงว่าปัญหาอยู่ที่
Wireless Display / Miracast / driver / network หรือ audio output ของ Windows
ไม่ใช่การ buffer MP3 ของเว็บ
