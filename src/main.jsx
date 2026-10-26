import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { captureAttribution } from '@/lib/attribution'
// Catches the browser's "install app" offer for the admin from the first load.
import '@/admin/lib/adminApp.js'

// Remember which tracked link (?utm_…) brought this visitor, for the order.
captureAttribution()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
