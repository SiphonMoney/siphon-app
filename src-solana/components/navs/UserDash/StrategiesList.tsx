'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getStrategies, getSolanaExplorerUrl, StrategyStatus } from '../../../lib/strategy';

interface StrategiesListProps {
    isLoaded?: boolean;
}

export default function StrategiesList({ isLoaded = true }: StrategiesListProps) {
    const { publicKey } = useWallet();
    const [strategies, setStrategies] = useState<StrategyStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStrategies = useCallback(async () => {
        if (!publicKey) return;

        setLoading(true);
        setError(null);

        try {
            const result = await getStrategies(publicKey.toBase58());
            if (result.success && result.strategies) {
                setStrategies(result.strategies);
            } else {
                setError(result.error || 'Failed to fetch strategies');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [publicKey]);

    useEffect(() => {
        if (publicKey) {
            fetchStrategies();
            // Poll every 30 seconds for updates
            const interval = setInterval(fetchStrategies, 30000);
            return () => clearInterval(interval);
        }
    }, [publicKey, fetchStrategies]);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'EXECUTED':
                return (
                    <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #00c853 0%, #69f0ae 100%)',
                        color: '#000',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Executed
                    </span>
                );
            case 'FAILED':
                return (
                    <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #f44336 0%, #ff8a80 100%)',
                        color: '#fff',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Failed
                    </span>
                );
            default:
                return (
                    <span style={{
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: 'linear-gradient(135deg, #ffc107 0%, #ffecb3 100%)',
                        color: '#000',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        animation: 'pulse 2s infinite'
                    }}>
                        ⏳ Processing
                    </span>
                );
        }
    };

    if (!isLoaded) return null;

    if (!publicKey) {
        return (
            <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '14px'
            }}>
                Connect your wallet to view strategies
            </div>
        );
    }

    return (
        <div style={{
            width: '100%',
            padding: '20px',
            boxSizing: 'border-box'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
            }}>
                <h2 style={{
                    color: '#fff',
                    fontSize: '20px',
                    fontWeight: 600,
                    margin: 0
                }}>
                    📋 Your Strategies
                </h2>
                <button
                    onClick={fetchStrategies}
                    disabled={loading}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(255,255,255,0.1)',
                        color: '#fff',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        transition: 'all 0.2s'
                    }}
                >
                    {loading ? '🔄 Loading...' : '↻ Refresh'}
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(244, 67, 54, 0.1)',
                    border: '1px solid rgba(244, 67, 54, 0.3)',
                    borderRadius: '8px',
                    color: '#ff8a80',
                    marginBottom: '16px',
                    fontSize: '13px'
                }}>
                    {error}
                </div>
            )}

            {strategies.length === 0 && !loading && !error && (
                <div style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '14px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '12px',
                    border: '1px dashed rgba(255,255,255,0.1)'
                }}>
                    <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                    No strategies yet. Create one in the Build view!
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {strategies.map((strategy) => (
                    <div
                        key={strategy.id}
                        style={{
                            padding: '16px 20px',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            transition: 'all 0.2s',
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '12px'
                        }}>
                            <div>
                                <div style={{
                                    fontSize: '15px',
                                    fontWeight: 600,
                                    color: '#fff',
                                    marginBottom: '4px'
                                }}>
                                    {strategy.amount} {strategy.asset_in} → {strategy.asset_out}
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: 'rgba(255,255,255,0.5)'
                                }}>
                                    {strategy.strategy_type} • Created {formatDate(strategy.created_at)}
                                </div>
                            </div>
                            {getStatusBadge(strategy.status)}
                        </div>

                        {strategy.status === 'EXECUTED' && strategy.tx_hash && (
                            <div style={{
                                padding: '10px 14px',
                                background: 'rgba(0, 200, 83, 0.08)',
                                borderRadius: '8px',
                                border: '1px solid rgba(0, 200, 83, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                            }}>
                                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>
                                    Transaction:
                                </span>
                                <a
                                    href={getSolanaExplorerUrl(strategy.tx_hash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        color: '#69f0ae',
                                        fontSize: '12px',
                                        fontFamily: 'monospace',
                                        textDecoration: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {strategy.tx_hash.slice(0, 8)}...{strategy.tx_hash.slice(-8)}
                                    <span style={{ fontSize: '10px' }}>↗</span>
                                </a>
                            </div>
                        )}

                        {strategy.status === 'EXECUTED' && strategy.executed_at && (
                            <div style={{
                                marginTop: '8px',
                                fontSize: '11px',
                                color: 'rgba(255,255,255,0.4)'
                            }}>
                                Executed at {formatDate(strategy.executed_at)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
