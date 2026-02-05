import { useState } from 'react'

function CertificateForm({ formData, setFormData, onSubmit, isLoading }) {
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

    const handleEmailChange = (e) => {
        setFormData({ ...formData, email: e.target.value })
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

    return (
        <div className="card fade-in">
            <div className="card-header">
                <div className="card-icon">📝</div>
                <div>
                    <h2 className="card-title">Información del Certificado</h2>
                    <p className="card-subtitle">Ingresa tus datos para generar el certificado SSL</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                {/* Email */}
                <div className="form-group">
                    <label className="form-label">Email de contacto *</label>
                    <input
                        type="email"
                        className="form-input"
                        placeholder="tu@email.com"
                        value={formData.email}
                        onChange={handleEmailChange}
                        required
                    />
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
        </div>
    )
}

export default CertificateForm
