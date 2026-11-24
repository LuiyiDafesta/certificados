import { useState, useEffect } from 'react'
import {
    getSavedEmails,
    getLastEmail,
    removeSavedEmail,
    getCertifiedDomains,
    removeCertifiedDomain,
    getDaysRemaining,
    generateGoogleCalendarUrl
} from '../utils/storage'

function CertificateForm({ formData, setFormData, onSubmit, isLoading }) {
    const [savedEmails, setSavedEmails] = useState([])
    const [certifiedDomains, setCertifiedDomains] = useState([])
    const [showHistory, setShowHistory] = useState(false)

    const certificateTypes = [
        {
            value: 'single',
            label: 'Dominio Único',
            description: 'Un solo dominio (ej: ejemplo.com)',
            icon: '🌐'
        },
        {
            value: 'multi',
            label: 'Multi-dominio (SAN)',
            description: 'Hasta 100 dominios en un certificado',
            icon: '🌍'
        },
        {
            value: 'wildcard',
            label: 'Wildcard',
            description: 'Todos los subdominios (ej: *.ejemplo.com)',
            icon: '✨'
        },
        {
            value: 'combined',
            label: 'Wildcard + Base',
            description: 'Dominio base + todos los subdominios',
            icon: '🔥'
        }
    ]

    // Cargar emails y dominios guardados en el inicio
    useEffect(() => {
        const emails = getSavedEmails()
        setSavedEmails(emails)

        const domains = getCertifiedDomains()
        setCertifiedDomains(domains)

        // Si el formulario no tiene email pero hay un último email usado, cargarlo
        if (!formData.email) {
            const last = getLastEmail()
            if (last) {
                setFormData(prev => ({ ...prev, email: last }))
            }
        }
    }, [])

    const handleEmailChange = (e) => {
        setFormData({ ...formData, email: e.target.value })
    }

    const handleSelectEmail = (selected) => {
        setFormData({ ...formData, email: selected })
    }

    const handleDeleteEmail = (e, emailToRemove) => {
        e.stopPropagation()
        removeSavedEmail(emailToRemove)
        setSavedEmails(getSavedEmails())
    }

    const handleTypeChange = (e) => {
        const type = e.target.value
        let domains = ['']

        // Reset domains based on type
        if (type === 'wildcard') {
            domains = ['*.']
        } else if (type === 'combined') {
            domains = ['', '*.']
        }

        setFormData({ ...formData, certificateType: type, domains })
    }

    const handleDomainChange = (index, value) => {
        const newDomains = [...formData.domains]
        newDomains[index] = value
        setFormData({ ...formData, domains: newDomains })
    }

    const addDomain = () => {
        if (formData.domains.length < 100) {
            setFormData({ ...formData, domains: [...formData.domains, ''] })
        }
    }

    const removeDomain = (index) => {
        if (formData.domains.length > 1) {
            const newDomains = formData.domains.filter((_, i) => i !== index)
            setFormData({ ...formData, domains: newDomains })
        }
    }

    const handleLoadFromHistory = (item) => {
        setFormData({
            email: item.email || formData.email,
            certificateType: item.certificateType || 'single',
            domains: [...item.domains]
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleDeleteDomainHistory = (id) => {
        removeCertifiedDomain(id)
        setCertifiedDomains(getCertifiedDomains())
    }

    const isFormValid = () => {
        const emailValid = formData.email.includes('@') && formData.email.includes('.')
        const domainsValid = formData.domains.some(d => d.trim().length > 0)
        return emailValid && domainsValid
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (isFormValid()) {
            onSubmit()
        }
    }

    // Sugerencias únicas de dominios para datalist
    const domainSuggestions = Array.from(
        new Set(certifiedDomains.flatMap(d => d.domains))
    ).filter(d => d && d.length > 0)

    return (
        <div className="card fade-in">
            <div className="card-header">
                <div className="card-icon">📝</div>
                <div>
                    <h2 className="card-title">Información del Certificado</h2>
                    <p className="card-subtitle">Ingresa tus datos o selecciona dominios anteriores</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* Email */}
                <div className="form-group">
                    <div className="label-with-badge">
                        <label className="form-label">Email de contacto *</label>
                        {savedEmails.length > 0 && (
                            <span className="badge-subtle">
                                {savedEmails.length} guardado{savedEmails.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <input
                        type="email"
                        className="form-input"
                        placeholder="tu@email.com"
                        value={formData.email}
                        onChange={handleEmailChange}
                        list="saved-emails-datalist"
                        required
                    />
                    <datalist id="saved-emails-datalist">
                        {savedEmails.map(em => (
                            <option key={em} value={em} />
                        ))}
                    </datalist>

                    {/* Chips de selección rápida de emails */}
                    {savedEmails.length > 0 && (
                        <div className="quick-chips-container">
                            <span className="chips-title">Emails frecuentes:</span>
                            <div className="chips-list">
                                {savedEmails.map(em => (
                                    <span
                                        key={em}
                                        className={`quick-chip ${formData.email === em ? 'active' : ''}`}
                                        onClick={() => handleSelectEmail(em)}
                                        title={`Usar ${em}`}
                                    >
                                        ✉️ {em}
                                        <button
                                            type="button"
                                            className="chip-delete-btn"
                                            onClick={(e) => handleDeleteEmail(e, em)}
                                            title="Eliminar este email de los guardados"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="form-hint">Let's Encrypt usará este email para notificaciones importantes</p>
                </div>

                {/* Certificate Type */}
                <div className="form-group">
                    <label className="form-label">Tipo de certificado *</label>
                    <select
                        className="form-select"
                        value={formData.certificateType}
                        onChange={handleTypeChange}
                    >
                        {certificateTypes.map(type => (
                            <option key={type.value} value={type.value}>
                                {type.icon} {type.label} - {type.description}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Domains */}
                <div className="form-group">
                    <label className="form-label">
                        {formData.certificateType === 'multi' ? 'Dominios *' : 'Dominio *'}
                    </label>

                    <datalist id="saved-domains-datalist">
                        {domainSuggestions.map(dom => (
                            <option key={dom} value={dom} />
                        ))}
                    </datalist>

                    {formData.domains.map((domain, index) => (
                        <div className="domain-input-group" key={index}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder={
                                    formData.certificateType === 'wildcard'
                                        ? '*.tudominio.com'
                                        : formData.certificateType === 'combined' && index === 1
                                            ? '*.tudominio.com'
                                            : 'tudominio.com'
                                }
                                value={domain}
                                onChange={(e) => handleDomainChange(index, e.target.value)}
                                list="saved-domains-datalist"
                                required
                            />
                            {formData.certificateType === 'multi' && formData.domains.length > 1 && (
                                <button
                                    type="button"
                                    className="btn btn-icon btn-danger"
                                    onClick={() => removeDomain(index)}
                                    title="Eliminar dominio"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}

                    {formData.certificateType === 'multi' && formData.domains.length < 100 && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={addDomain}
                            style={{ marginTop: '0.5rem' }}
                        >
                            + Agregar otro dominio
                        </button>
                    )}

                    {formData.certificateType === 'wildcard' && (
                        <p className="form-hint">
                            ⚠️ El certificado wildcard cubre todos los subdominios pero NO el dominio base.
                            Si necesitas ambos, usa "Wildcard + Base".
                        </p>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={!isFormValid() || isLoading}
                >
                    {isLoading ? (
                        <>
                            <div className="loading-spinner" style={{ width: 20, height: 20 }}></div>
                            Generando...
                        </>
                    ) : (
                        <>🚀 Generar registros DNS</>
                    )}
                </button>
            </form>

            {/* Sección de Historial de Dominios Certificados */}
            {certifiedDomains.length > 0 && (
                <div className="history-section">
                    <div className="history-toggle-header" onClick={() => setShowHistory(!showHistory)}>
                        <div className="history-toggle-title">
                            <span className="history-icon">📜</span>
                            <div>
                                <span className="history-heading">Dominios certificados anteriormente ({certifiedDomains.length})</span>
                                <span className="history-subheading">Clic para cargar datos o agendar recordatorio</span>
                            </div>
                        </div>
                        <button type="button" className="btn btn-sm btn-secondary history-btn-toggle">
                            {showHistory ? '▲ Ocultar' : '▼ Ver historial'}
                        </button>
                    </div>

                    {showHistory && (
                        <div className="history-items-container fade-in">
                            {certifiedDomains.map((item) => {
                                const days = getDaysRemaining(item.expiresAt)
                                const calUrl = generateGoogleCalendarUrl({
                                    domains: item.domains,
                                    email: item.email,
                                    expiresAt: item.expiresAt
                                })

                                let statusBadgeClass = 'badge-status-ok'
                                let statusText = `Vence en ${days} días`
                                if (days <= 0) {
                                    statusBadgeClass = 'badge-status-danger'
                                    statusText = `Vencido hace ${Math.abs(days)}d`
                                } else if (days <= 20) {
                                    statusBadgeClass = 'badge-status-warning'
                                    statusText = `⚠️ Vence en ${days}d`
                                }

                                return (
                                    <div key={item.id} className="history-row-item">
                                        <div className="history-info-col">
                                            <div className="history-domain-title">
                                                <strong>{item.mainDomain}</strong>
                                                {item.domains.length > 1 && (
                                                    <span className="badge-subtle">+{item.domains.length - 1} sub</span>
                                                )}
                                                <span className={`status-pill ${statusBadgeClass}`}>{statusText}</span>
                                            </div>
                                            <div className="history-meta-text">
                                                <span>Emitido: {new Date(item.issuedAt).toLocaleDateString('es-ES')}</span>
                                                {item.email && <span> • {item.email}</span>}
                                            </div>
                                        </div>

                                        <div className="history-actions-col">
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-secondary"
                                                onClick={() => handleLoadFromHistory(item)}
                                                title="Cargar automáticamente en el formulario"
                                            >
                                                ⚡ Cargar
                                            </button>
                                            <a
                                                href={calUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-sm btn-calendar"
                                                title="Crear recordatorio en Google Calendar"
                                            >
                                                📅 Calendar
                                            </a>
                                            <button
                                                type="button"
                                                className="btn-delete-item"
                                                onClick={() => handleDeleteDomainHistory(item.id)}
                                                title="Quitar este dominio del historial"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default CertificateForm
