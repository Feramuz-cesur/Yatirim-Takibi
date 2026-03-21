@echo off
color 0A
echo ====================================================
echo Yatirim Takibi Uygulamasi Baslatiliyor...
echo Lutfen acilan iki siyah pencereyi kapatmayin.
echo ====================================================

echo [1] Backend (Veri Cekme) Sunucusu Baslatiliyor...
start "Backend" cmd /k "cd backend && node server.js"

echo [2] Frontend (Arayuz) Sunucusu Baslatiliyor...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Tarayicida arayuze gitmek icin acilan Frontend penceresindeki http://localhost:517x linkine tiklayin.
echo Tarayici otomatik acilacaktir...
timeout /t 3 >nul

start http://localhost:5173
