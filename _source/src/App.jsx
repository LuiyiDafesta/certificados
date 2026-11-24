import { useState } from 'react'
import CertificateForm from './components/CertificateForm'
import DNSRecords from './components/DNSRecords'
import CertificateDownload from './components/CertificateDownload'
import { saveEmail, saveCertifiedDomain } from './utils/storage'

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://apissl.lsnetinformatica.com.ar'

function App() {
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState(null)
  const [copySuccess, setCopySuccess] = useState(false)

  // Form data
  const [formData, setFormData] = useState({
    email: '',
    certificateType: 'single',
    domains: ['']
  })

  // DNS Records from API
  const [dnsRecords, setDnsRecords] = useState([])
  const [orderData, setOrderData] = useState(null)

  // Certificate data
  const [certificate, setCertificate] = useState({
    crt: '',
    privateKey: '',
    caBundle: ''
  })

  const steps = [
    { number: 1, label: 'Datos' },
    { number: 2, label: 'DNS' },
    { number: 3, label: 'Certificado' }
  ]

  const showCopySuccess = () => {
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2500)
  }

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      showCopySuccess()
    } catch (err) {
      console.error('Error copying:', err)
    }
  }

  // Step 1: Generate DNS Challenge
  const handleGenerateChallenge = async () => {
    setError(null)
    setIsLoading(true)
    setLoadingMessage('Generando desafío DNS...')

    try {
      const response = await fetch(`${API_BASE_URL}/generate-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          domains: formData.domains.filter(d => d.trim() !== ''),
          certificateType: formData.certificateType
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || 'Error al generar el desafío DNS')
      }

      const data = await response.json()

      saveEmail(formData.email)
      setDnsRecords(data.dnsRecords || [])
      setOrderData(data.orderData || null)
      setCurrentStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Step 2: Verify DNS and Get Certificate
  const handleGetCertificate = async () => {
    setError(null)
    setIsLoading(true)
    setLoadingMessage('Verificando registros DNS y generando certificado...')

    try {
      const response = await fetch(`${API_BASE_URL}/get-certificate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderData: orderData,
          email: formData.email,
          domains: formData.domains.filter(d => d.trim() !== '')
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || 'Error al obtener el certificado')
      }

      const data = await response.json()

      saveEmail(formData.email)
      saveCertifiedDomain({
        domains: formData.domains.filter(d => d.trim() !== ''),
        certificateType: formData.certificateType,
        email: formData.email
      })

      setCertificate({
        crt: data.certificate || '',
        privateKey: data.privateKey || '',
        caBundle: data.caBundle || ''
      })
      setCurrentStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStartOver = () => {
    setCurrentStep(1)
    setFormData(prev => ({
      email: prev.email,
      certificateType: 'single',
      domains: ['']
    }))
    setDnsRecords([])
    setOrderData(null)
    setCertificate({ crt: '', privateKey: '', caBundle: '' })
    setError(null)
  }

  const downloadFile = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p className="loading-text">{loadingMessage}</p>
        </div>
      )}

      {copySuccess && (
        <div className="copy-success">✓ Copiado al portapapeles</div>
      )}

      <div className="container">
        <header className="app-header">
          <div className="logo-icon">🔐</div>
          <h1>SSL Certificate Generator</h1>
          <p>Genera certificados SSL gratuitos con Let's Encrypt</p>
        </header>

        {/* Steps Indicator */}
        <div className="steps-indicator">
          {steps.map((step) => (
            <div
              key={step.number}
              className={`step ${currentStep === step.number ? 'active' : ''} ${currentStep > step.number ? 'completed' : ''}`}
            >
              <div className="step-number">
                {currentStep > step.number ? '✓' : step.number}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error fade-in">
            <span className="alert-icon">⚠️</span>
            <div>
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Step 1: Form */}
        {currentStep === 1 && (
          <CertificateForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleGenerateChallenge}
            isLoading={isLoading}
          />
        )}

        {/* Step 2: DNS Records */}
        {currentStep === 2 && (
          <DNSRecords
            dnsRecords={dnsRecords}
            onGetCertificate={handleGetCertificate}
            onBack={() => {
              setCurrentStep(1)
              setOrderData(null)
              setDnsRecords([])
            }}
            copyToClipboard={copyToClipboard}
            isLoading={isLoading}
          />
        )}

        {/* Step 3: Certificate */}
        {currentStep === 3 && (
          <CertificateDownload
            certificate={certificate}
            domains={formData.domains}
            email={formData.email}
            copyToClipboard={copyToClipboard}
            downloadFile={downloadFile}
            onStartOver={handleStartOver}
          />
        )}

        <footer className="footer">
          <p>
            Powered by <a href="https://letsencrypt.org" target="_blank" rel="noopener noreferrer">Let's Encrypt</a> •
            Desarrollado por <a href="https://lsnetinformatica.com.ar" target="_blank" rel="noopener noreferrer">LSNet Informática</a>
          </p>
        </footer>
      </div>
    </div>
  )
}

export default App
