// Full updated version with updated default store hours
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import axios from 'axios';

const defaultStoreHours = {
  Monday: null,
  Tuesday: { open: '09:00 AM', close: '06:30 PM' },
  Wednesday: { open: '09:00 AM', close: '06:30 PM' },
  Thursday: { open: '09:00 AM', close: '06:30 PM' },
  Friday: { open: '09:00 AM', close: '06:30 PM' },
  Saturday: { open: '09:00 AM', close: '07:00 PM' },
  Sunday: null,
};

// ...rest of the code remains unchanged