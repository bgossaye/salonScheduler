@echo off
echo ===== Salon Booking App Mock Backend Setup =====

:: Step 1: Navigate to backend
cd /d C:\Users\15853\Documents\salon-booking-app\backend

:: Step 2: Create routes folder if it doesn't exist
if not exist routes mkdir routes

:: Step 3: Write mockAppointments.js
(
echo const express = require('express');
echo const { v4: uuidv4 } = require('uuid');
echo const router = express.Router();
echo.
echo let mockAppointments = [
echo   { id: '1', customer: 'Alice', service: 'Haircut', date: '2025-05-10T10:00:00Z', status: 'scheduled' },
echo   { id: '2', customer: 'Bob', service: 'Braiding', date: '2025-05-11T12:00:00Z', status: 'completed' }
echo ];
echo.
echo router.get('/', (req, res) => res.json(mockAppointments));
echo.
echo router.post('/', (req, res) => {
echo   const newAppt = { id: uuidv4(), ...req.body };
echo   mockAppointments.push(newAppt);
echo   res.status(201).json(newAppt);
echo });
echo.
echo router.put('/:id', (req, res) => {
echo   const index = mockAppointments.findIndex(a => a.id === req.params.id);
echo   if (index === -1) return res.status(404).send('Not found');
echo   mockAppointments[index] = { ...mockAppointments[index], ...req.body };
echo   res.json(mockAppointments[index]);
echo });
echo.
echo router.delete('/:id', (req, res) => {
echo   mockAppointments = mockAppointments.filter(a => a.id !== req.params.id);
echo   res.status(204).send();
echo });
echo.
echo module.exports = router;
) > routes\mockAppointments.js

:: Step 4: Install uuid if not present
echo Installing uuid...
npm install uuid --save

:: Step 5: Inject mock route into server.js (only if not already present)
findstr /C:"/api/mock/appointments" server.js >nul 2>&1
if errorlevel 1 (
    echo Updating server.js with mock route...
    echo. >> server.js
    echo const mockAppointments = require('./routes/mockAppointments'); >> server.js
    echo app.use('/api/mock/appointments', mockAppointments); >> server.js
)

:: Step 6: Start backend server
start cmd /k "cd /d C:\Users\15853\Documents\salon-booking-app\backend && node server.js"

:: Step 7: Start frontend (in another terminal)
start cmd /k "cd /d C:\Users\15853\Documents\salon-booking-app\frontend && npm start"

echo ==== Mock server and frontend started ====
pause
