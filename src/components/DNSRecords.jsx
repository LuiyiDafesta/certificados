function DNSRecords({ dnsRecords, onGetCertificate, onBack, copyToClipboard, isLoading }) {
    return (
        <div className="card fade-in">
            <div className="card-header">
                <div className="card-icon">📋</div>
                <div>
                    <h2 className="card-title">Configura los registros DNS</h2>
                    <p className="card-subtitle">Agrega estos registros TXT en tu panel de DNS</p>
                </div>
            </div>

            <div className="alert alert-info">
                <span className="alert-icon">ℹ️</span>
                <div>
                    <strong>Instrucciones:</strong> Copia cada registro y agrégalo como registro TXT en el panel
                    de DNS de tu hosting. Espera 2-5 minutos para que se propaguen antes de continuar.
                </div>
            </div>

            {dnsRecords.length === 0 ? (
                <div className="alert alert-warning">
                    <span className="alert-icon">⚠️</span>
                    <div>No se generaron registros DNS. Por favor, vuelve al paso anterior.</div>
                </div>
            ) : (
                dnsRecords.map((record, index) => (
                    <div className="dns-record" key={index}>
                        <div className="dns-record-header">
                            <span className="dns-record-type">TXT</span>
                            <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => copyToClipboard(`${record.name}\n${record.value}`)}
                            >
                                📋 Copiar todo
                            </button>
                        </div>

                        <div>
                            <p className="dns-record-label">Nombre del registro (Host):</p>
                            <div className="dns-record-value" onClick={() => copyToClipboard(record.name)}>
                                {record.name}
                            </div>
                        </div>

                        <div>
                            <p className="dns-record-label">Valor del registro:</p>
                            <div className="dns-record-value" onClick={() => copyToClipboard(record.value)}>
                                {record.value}
                            </div>
                        </div>
                    </div>
                ))
            )}

            <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                <span className="alert-icon">⏳</span>
                <div>
                    <strong>Importante:</strong> Después de agregar los registros, espera al menos 2-5 minutos
                    para que se propaguen por los servidores DNS antes de presionar "Obtener certificado".
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button
                    className="btn btn-secondary"
                    onClick={onBack}
                    disabled={isLoading}
                >
                    ← Volver
                </button>
                <button
                    className="btn btn-success btn-full"
                    onClick={onGetCertificate}
                    disabled={dnsRecords.length === 0 || isLoading}
                >
                    {isLoading ? (
                        <>
                            <div className="loading-spinner" style={{ width: 20, height: 20 }}></div>
                            Verificando...
                        </>
                    ) : (
                        <>✅ Ya configuré los registros - Obtener certificado</>
                    )}
                </button>
            </div>
        </div>
    )
}

export default DNSRecords
