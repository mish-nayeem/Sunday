import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { captureAttribution } from '@/lib/attribution'
import { Sentry } from '@/lib/sentry'
// Catches the browser's "install app" offer for the admin from the first load.
import '@/admin/lib/adminApp.js'

// Remember which tracked link (?utm_…) brought this visitor, for the order.
captureAttribution()

// Something broke while drawing a page: a plain message instead of a blank
// screen, and the error sent to Sentry (when it's set up).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontSize: 14 }}>
        <div>
          <p style={{ marginBottom: 12 }}>Something went wrong. Please refresh the page.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ textDecoration: 'underline' }}>Refresh</button>
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
