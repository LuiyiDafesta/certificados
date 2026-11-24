import { generateGoogleCalendarUrl } from '../utils/storage'

function CertificateDownload({ certificate, domains, email, copyToClipboard, downloadFile, onStartOver }) {
    const mainDomain = domains.find(d => d && !d.startsWith('*.')) || domains[0] || 'certificate'
    const cleanDomain = mainDomain.replace(/[^a-zA-Z0-9.-]/g, '')

    // Fecha de expiración a 90 días
    const expireDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    const expireDateFormatted = expireDate.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })

    const calendarUrl = generateGoogleCalendarUrl({
        domains,
        email,
        expiresAt: expireDate.toISOString(),
        reminderDaysBefore: 15
    })

    return (
        <div className="card fade-in">
            <div className="card-header">
                <div className="card-icon" style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}>
                    🎉
                </div>
                <div>
                    <h2 className="card-title">¡Certificado generado!</h2>
                    <p className="card-subtitle">Tu certificado SSL está listo para usar</p>
                </div>
            </div>

            <div className="alert alert-success">
                <span className="alert-icon">✅</span>
                <div>
                    <strong>¡Felicidades!</strong> Tu certificado SSL ha sido generado exitosamente.
                    Copia o descarga los archivos y configúralos en tu servidor.
                </div>
            </div>

            {/* Google Calendar Reminder Card */}
            <div className="calendar-reminder-card">
                <div className="calendar-reminder-header">
                    <span className="calendar-reminder-icon">📅</span>
                    <div>
                        <h3 className="calendar-reminder-title">Agendar Recordatorio de Vencimiento</h3>
                        <p className="calendar-reminder-desc">
                            Tu certificado es válido por 90 días (vence el <strong>{expireDateFormatted}</strong>).
                            Agrega un recordatorio automático en Google Calendar para que te avise 15 días antes.
                        </p>
                    </div>
                </div>
                <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-calendar btn-full"
                    style={{ textDecoration: 'none', justifyContent: 'center' }}
                >
                    📅 Agregar aviso a Google Calendar (15 días antes)
                </a>
            </div>

            {/* Certificate CRT */}
            <div className="certificate-output">
                <div className="certificate-label">
                    <span>🔒</span> Certificado (CRT)
                </div>
                <textarea
                    className="certificate-textarea"
                    value={certificate.crt}
                    readOnly
                />
                <div className="certificate-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => copyToClipboard(certificate.crt)}
                    >
                        📋 Copiar
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => downloadFile(certificate.crt, `${cleanDomain}.crt`)}
                    >
                        ⬇️ Descargar .crt
                    </button>
                </div>
            </div>

            {/* Private Key */}
            <div className="certificate-output">
                <div className="certificate-label">
                    <span>🔑</span> Clave Privada (Private Key)
                </div>
                <textarea
                    className="certificate-textarea"
                    value={certificate.privateKey}
                    readOnly
                />
                <div className="certificate-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => copyToClipboard(certificate.privateKey)}
                    >
                        📋 Copiar
                    </button>
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => downloadFile(certificate.privateKey, `${cleanDomain}.key`)}
                    >
                        ⬇️ Descargar .key
                    </button>
                </div>
            </div>

            {/* CA Bundle (if available) */}
            {certificate.caBundle && (
                <div className="certificate-output">
                    <div className="certificate-label">
                        <span>📜</span> CA Bundle (Cadena de certificados)
                    </div>
                    <textarea
                        className="certificate-textarea"
                        value={certificate.caBundle}
                        readOnly
                    />
                    <div className="certificate-actions">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => copyToClipboard(certificate.caBundle)}
                        >
                            📋 Copiar
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => downloadFile(certificate.caBundle, `${cleanDomain}-ca-bundle.crt`)}
                        >
                            ⬇️ Descargar CA Bundle
                        </button>
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="alert alert-info" style={{ marginTop: '1.5rem' }}>
                <span className="alert-icon">💡</span>
                <div>
                    <strong>¿Cómo instalar?</strong><br />
                    En cPanel: SSL/TLS → Manage SSL Sites → Pega el certificado, clave privada y CA bundle.<br />
                    El certificado es válido por <strong>90 días</strong>. Recuerda renovarlo antes de que expire.
                </div>
            </div>

            {/* Start Over */}
            <button
                className="btn btn-secondary btn-full"
                onClick={onStartOver}
                style={{ marginTop: '1rem' }}
            >
                🔄 Generar otro certificado
            </button>
        </div>
    )
}

export default CertificateDownload
