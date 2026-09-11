cd /d F:\queue-system && node server.js

http://192.168.1.101:3000/doctor.html?room=1
http://192.168.1.101:3000/nurse.html
http://192.168.1.101:3000/display.html

cd /d F:\queue-system
cd /d F:\Mithmitree_SP4\ระบบเรียกคิวตรวจ\SmartQueueSystem

node server.js
netstat -ano | findstr :3000
taskkill /PID 12345 /F


ipconfig

queue-system/
│
├── server/
│   ├── server.js
│   ├── db.js
│   └── models/
│       └── queue.model.js
│
├── public/
│   ├── nurse.html
│   ├── doctor.html
│   ├── display.html
│   ├── js/
│   │   ├── nurse.js
│   │   ├── doctor.js
│   │   └── display.js
│   └── image/
│
├── audio/
├── package.json