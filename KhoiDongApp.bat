@echo off
chcp 65001 >nul
title zOffice - Quản Lý Văn Bản & Công Việc
cd /d "%~dp0"
echo Đang khởi động ứng dụng zOffice...
call npm.cmd start
