import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import ReactApexChart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { LogOut, LayoutDashboard, Database, TrendingUp, Zap, ArrowUpRight, ArrowDownRight, Activity, Menu, Building2, Download, FileText, Sun, Moon, Calculator, Info, Search, UploadCloud, ChevronDown, ChevronUp, Filter } from 'lucide-react';

const Dashboard = () => {
    const [summary, setSummary] = useState<any>(null);
    const [allocation, setAllocation] = useState<any>(null);
    const [performance, setPerformance] = useState<any>(null);
    const [holdings, setHoldings] = useState<any[]>([]);
    const [selectedStatement, setSelectedStatement] = useState<any>(null);
    const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);

    // Bank level Performance State
    const [bankPerformanceData, setBankPerformanceData] = useState<any[]>([]);
    const [isPerformanceModalOpen, setIsPerformanceModalOpen] = useState(false);

    // Discovery Engine Filters
    const [fundSearchQuery, setFundSearchQuery] = useState("");
    const [selectedRiskFilter, setSelectedRiskFilter] = useState<string | null>(null);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [expandedFundId, setExpandedFundId] = useState<number | null>(null);

    const [isUploadingFMR, setIsUploadingFMR] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [selectedBank, setSelectedBank] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<number | null>(null);
    const navigate = useNavigate();

    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    });

    const [isCalculatorModalOpen, setIsCalculatorModalOpen] = useState(false);

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'light') {
            root.classList.add('light');
        } else {
            root.classList.remove('light');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
            else setIsSidebarOpen(true);
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Add a timeout to prevent infinite loading
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Request timed out")), 5000)
                );

                const q = selectedBank ? `?bank=${selectedBank}` : '';
                const timeQ = timeRange ? `days=${timeRange}` : '';
                const advancedQ = selectedBank ? `?bank=${selectedBank}${timeQ ? '&' + timeQ : ''}` : (timeQ ? `?${timeQ}` : '');

                const summaryReq = client.get(`/dashboard/summary${q}`);
                const allocReq = client.get(`/dashboard/allocation${advancedQ}`);
                const perfReq = client.get(`/dashboard/performance${advancedQ}`);
                const holdingsReq = client.get(`/dashboard/holdings${q}`);

                const requests = [summaryReq, allocReq, perfReq, holdingsReq];

                if (selectedBank) {
                    requests.push(client.get(`/api/performance/bank/${selectedBank}`).catch(() => ({ data: [] })) as any);
                }

                const responses = await Promise.race([
                    Promise.all(requests),
                    timeoutPromise
                ]) as any;

                const [summaryRes, allocRes, perfRes, holdingsRes, bankPerfRes] = responses;

                setSummary(summaryRes.data);
                setHoldings(holdingsRes.data);

                const pieData = allocRes.data.dates.map((name: string, index: number) => ({
                    name, value: allocRes.data.values[index]
                }));
                setAllocation(pieData);

                const lineData = perfRes.data.dates.map((date: string, index: number) => ({
                    date, value: perfRes.data.values[index]
                }));
                setPerformance(lineData);

                if (bankPerfRes && bankPerfRes.data) {
                    setBankPerformanceData(bankPerfRes.data);
                } else {
                    setBankPerformanceData([]);
                }

            } catch (err: any) {
                console.error("Dashboard fetch error:", err);
                if (err.response?.status === 401) {
                    navigate('/login');
                } else {
                    setError(err.message || "Failed to load dashboard data. Ensure backend is running.");
                }
            }
        };
        fetchData();
    }, [navigate, selectedBank, timeRange]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    const handleFMRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        const formData = new FormData();
        formData.append("file", file);

        setIsUploadingFMR(true);
        try {
            const res = await client.post('/api/performance/upload-fmr', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            alert(res.data.message || "FMR processed successfully.");
            // Refresh bank data if modal is open
            if (selectedBank) {
                const req = await client.get(`/api/performance/bank/${selectedBank}`);
                setBankPerformanceData(req.data);
            }
        } catch (err: any) {
            console.error(err);
            alert("Failed to upload FMR: " + (err.response?.data?.detail || err.message));
        } finally {
            setIsUploadingFMR(false);
            e.target.value = ''; // reset input
        }
    };

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                return null; // toggle off
            }
            return { key, direction: 'desc' }; // default to highest first
        });
    };

    const handleExportCSV = () => {
        if (holdings.length === 0) return;

        const headers = ["Bank", "Portfolio/Account", "Category", "Units", "NAV", "Investment Amount", "Market Value", "Gain/Loss", "Percentage Change"];
        let csv = headers.join(",") + "\n";

        holdings.forEach(h => {
            const row = [
                `"${h.bank}"`,
                `"${h.portfolio_account || 'Unknown'}"`,
                `"${h.category}"`,
                h.units,
                h.nav,
                h.investment_amount,
                h.market_value,
                h.gain_loss,
                h.percentage_change.toFixed(2) + "%"
            ];
            csv += row.join(",") + "\n";
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `Portfolio-Data-${selectedBank || 'All'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleExportPDF = async () => {
        const fileName = `Portfolio-Report-${selectedBank || 'All'}.pdf`;

        try {
            // @ts-ignore
            if (window.api && window.api.exportPDF) {
                // @ts-ignore
                const success = await window.api.exportPDF(fileName);
                if (success) {
                    alert(`Success! Portfolio Report saved successfully.`);
                }
            } else {
                alert("Native PDF Export is not available in this environment.");
            }
        } catch (err: any) {
            console.error("PDF generation error:", err);
            alert("Error generating PDF: " + (err.message || err.toString()));
        }
    };

    const COLORS = ['#8B5CF6', '#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#64748B'];

    if (error) return (
        <div className="flex items-center justify-center h-screen bg-midnight text-danger">
            <div className="flex flex-col items-center gap-4 text-center">
                <div className="p-4 bg-danger/10 rounded-full">
                    <LogOut className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold">Connection Error</h3>
                <p className="text-text-secondary max-w-md">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-6 py-2 bg-surface border border-[var(--color-white-10)] rounded-lg hover:bg-[var(--color-white-5)] transition-colors text-text-primary"
                >
                    Retry Connection
                </button>
                <button onClick={handleLogout} className="text-sm text-text-secondary underline hover:text-text-primary">
                    Back to Login
                </button>
            </div>
        </div>
    );

    if (!summary) return (
        <div className="flex items-center justify-center h-screen bg-midnight text-neon-purple">
            <div className="flex flex-col items-center gap-4">
                <Activity className="w-12 h-12 animate-spin" />
                <span className="text-lg font-medium tracking-widest uppercase">Initializing Terminal...</span>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-midnight text-text-primary overflow-hidden font-sans selection:bg-neon-purple selection:text-text-primary">

            {/* Sidebar Overlay for Mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-20 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 w-64 bg-surface border-r border-[var(--color-white-5)] flex flex-col transition-transform duration-300 z-30
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-20 xl:w-64'}
            `}>
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-purple to-electric-blue flex items-center justify-center shadow-lg shadow-neon-purple/20 shrink-0">
                        <Activity className="text-text-primary w-5 h-5" />
                    </div>
                    <h1 className={`text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:hidden xl:block xl:opacity-100'}`}>
                        Fund<span className="text-neon-purple">Tracker</span>
                    </h1>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
                    <div className="mb-6">
                        <p className={`text-xs font-semibold text-text-secondary mb-2 px-3 tracking-wider ${!isSidebarOpen && 'hidden xl:block'}`}>OVERVIEW</p>
                        <NavItem
                            icon={<LayoutDashboard size={20} />}
                            label="Global Portfolio"
                            active={selectedBank === null}
                            isOpen={isSidebarOpen}
                            onClick={() => setSelectedBank(null)}
                        />
                    </div>

                    <div className="mb-6">
                        <p className={`text-xs font-semibold text-text-secondary mb-2 px-3 tracking-wider ${!isSidebarOpen && 'hidden xl:block'}`}>INSTITUTIONS</p>
                        <NavItem icon={<Building2 size={20} />} label="Meezan Bank" active={selectedBank === 'Meezan'} isOpen={isSidebarOpen} onClick={() => setSelectedBank('Meezan')} />
                        <NavItem icon={<Building2 size={20} />} label="HBL" active={selectedBank === 'HBL'} isOpen={isSidebarOpen} onClick={() => setSelectedBank('HBL')} />
                        <NavItem icon={<Building2 size={20} />} label="Atlas Funds" active={selectedBank === 'Atlas'} isOpen={isSidebarOpen} onClick={() => setSelectedBank('Atlas')} />
                        <NavItem icon={<Building2 size={20} />} label="Faysal Funds" active={selectedBank === 'Faysal'} isOpen={isSidebarOpen} onClick={() => setSelectedBank('Faysal')} />
                    </div>
                </nav>

                <div className="p-4 border-t border-[var(--color-white-5)]">
                    <button onClick={handleLogout} className={`flex items-center gap-3 text-text-secondary hover:text-text-primary hover:bg-[var(--color-white-5)] p-3 rounded-xl transition-all w-full group ${!isSidebarOpen && 'justify-center'}`}>
                        <LogOut size={20} className="group-hover:text-danger transition-colors" />
                        <span className={`${isSidebarOpen ? 'block' : 'hidden xl:block'} font-medium`}>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Background Glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-neon-purple/5 blur-[120px] rounded-full pointer-events-none" />

                {/* Header */}
                <header className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--color-white-5)] bg-surface/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 bg-[var(--color-white-5)] hover:bg-[var(--color-white-10)] rounded-xl lg:hidden text-text-secondary hover:text-text-primary transition-colors"
                        >
                            <Menu size={20} />
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Portfolio Analytics</h2>
                            <p className="text-text-secondary text-sm">Real-time performance metrics</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className="p-2 bg-[var(--color-white-5)] hover:bg-[var(--color-white-10)] border border-[var(--color-white-10)] rounded-xl text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center"
                            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        >
                            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                        </button>

                        <button
                            onClick={() => setIsCalculatorModalOpen(true)}
                            className="px-4 py-2 bg-[var(--color-white-5)] hover:bg-[var(--color-white-10)] border border-[var(--color-white-10)] rounded-xl text-text-primary text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Calculator size={16} className="text-accent-pink" />
                            <span className="hidden sm:inline">Zakat Calc</span>
                        </button>
                        {selectedBank && (
                            <button
                                onClick={() => setIsPerformanceModalOpen(true)}
                                className="px-4 py-2 bg-[var(--color-white-5)] hover:bg-[var(--color-white-10)] border border-neon-purple/50 rounded-xl text-white shadow-lg shadow-neon-purple/10 text-sm font-medium transition-colors flex items-center gap-2"
                            >
                                <TrendingUp size={16} className="text-neon-purple" />
                                <span className="hidden sm:inline">Fund Performance</span>
                            </button>
                        )}
                        <button
                            onClick={handleExportCSV}
                            className="px-4 py-2 bg-[var(--color-white-5)] hover:bg-[var(--color-white-10)] border border-[var(--color-white-10)] rounded-xl text-text-primary text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="px-4 py-2 bg-[var(--color-white-5)] border border-[var(--color-white-10)] text-text-primary rounded-xl text-sm font-medium hover:bg-[var(--color-white-10)] transition-all flex items-center gap-2"
                        >
                            <FileText size={16} />
                            <span className="hidden sm:inline">Export PDF</span>
                        </button>
                        <label className="px-4 py-2 bg-gradient-to-r from-neon-purple to-electric-blue text-white rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-neon-purple/20 transition-all flex items-center gap-2 cursor-pointer relative overflow-hidden group">
                            {isUploadingFMR ? <Activity size={16} className="animate-spin" /> : <UploadCloud size={16} className="group-hover:-translate-y-1 transition-transform" />}
                            <span className="hidden sm:inline">{isUploadingFMR ? 'Processing AI...' : 'Upload FMR'}</span>
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform rounded-xl pointer-events-none" />
                            <input type="file" accept=".pdf" className="hidden" onChange={handleFMRUpload} disabled={isUploadingFMR} />
                        </label>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 hide-in-pdf">
                    <div className="max-w-7xl mx-auto space-y-8">

                        {/* Time Range Filter */}
                        <div className="flex items-center gap-2 bg-surface p-1 rounded-xl w-max border border-[var(--color-white-5)] hide-in-pdf">
                            {[
                                { label: '1M', value: 30 },
                                { label: '3M', value: 90 },
                                { label: '6M', value: 180 },
                                { label: '1Y', value: 365 },
                                { label: 'All', value: null }
                            ].map((t) => (
                                <button
                                    key={t.label}
                                    onClick={() => setTimeRange(t.value)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${timeRange === t.value ? 'bg-neon-purple text-white shadow-md shadow-neon-purple/20' : 'text-text-secondary hover:text-text-primary hover:bg-[var(--color-white-5)]'}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* KPI Grid */}



                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <KPICard
                                title="Net Worth"
                                value={`PKR ${(summary.total_net_worth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                trend="+2.4%"
                                trendUp={true}
                                icon={<Database className="text-electric-blue" />}
                            />
                            <KPICard
                                title="Total Invested"
                                value={`PKR ${(summary.total_invested || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                trend="+1.1%"
                                trendUp={true}
                                icon={<Activity className="text-neon-purple" />}
                            />
                            <KPICard
                                title="Total Gain / Loss"
                                value={`PKR ${(summary.total_gain_loss || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                trend={summary.total_return_percentage ? `${summary.total_return_percentage.toFixed(2)}%` : "0.00%"}
                                trendUp={(summary.total_gain_loss || 0) >= 0}
                                icon={<TrendingUp className={(summary.total_gain_loss || 0) >= 0 ? "text-success" : "text-danger"} />}
                            />
                            <KPICard
                                title="Top Performer"
                                value={summary.top_performing_bank}
                                subtitle="Best ROI"
                                icon={<Zap className="text-warning" />}
                            />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Line Chart */}
                            <div className="lg:col-span-2 bg-surface border border-[var(--color-white-5)] rounded-2xl p-6 relative group flex flex-col">
                                <div className="absolute inset-0 bg-gradient-to-r from-neon-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none" />
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 shrink-0">
                                    <TrendingUp size={20} className="text-neon-purple" />
                                    Portfolio Trajectory
                                </h3>
                                <div className="flex-1 w-full min-h-[300px]">
                                    {performance && performance.length > 0 ? (
                                        <ReactApexChart 
                                            options={{
                                                chart: {
                                                    type: 'area',
                                                    background: 'transparent',
                                                    toolbar: {
                                                        show: true,
                                                        autoSelected: 'zoom',
                                                        tools: {
                                                            download: false,
                                                            selection: true,
                                                            zoom: true,
                                                            zoomin: true,
                                                            zoomout: true,
                                                            pan: true,
                                                            reset: true
                                                        }
                                                    },
                                                    animations: { enabled: false }
                                                },
                                                theme: { mode: 'dark' },
                                                colors: ['#8B5CF6'],
                                                fill: {
                                                    type: 'gradient',
                                                    gradient: {
                                                        shadeIntensity: 1,
                                                        opacityFrom: 0.4,
                                                        opacityTo: 0.05,
                                                        stops: [0, 90, 100]
                                                    }
                                                },
                                                dataLabels: { enabled: false },
                                                stroke: { curve: 'straight', width: 3 },
                                                xaxis: {
                                                    type: 'datetime',
                                                    categories: performance.map((p: any) => p.date),
                                                    labels: { style: { colors: '#94A3B8' } },
                                                    axisBorder: { show: false },
                                                    axisTicks: { show: false },
                                                    tooltip: { enabled: false }
                                                },
                                                yaxis: {
                                                    labels: {
                                                        style: { colors: '#94A3B8' },
                                                        formatter: (value) => `PKR ${(value / 1000).toFixed(0)}k`
                                                    }
                                                },
                                                grid: {
                                                    borderColor: 'rgba(255,255,255,0.05)',
                                                    strokeDashArray: 3,
                                                    xaxis: { lines: { show: false } },
                                                    yaxis: { lines: { show: true } }
                                                },
                                                tooltip: {
                                                    theme: 'dark',
                                                    y: { formatter: (value) => `PKR ${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` }
                                                }
                                            } as ApexOptions} 
                                            series={[{
                                                name: 'Net Worth',
                                                data: performance.map((p: any) => p.value)
                                            }]} 
                                            type="area" 
                                            height="100%" 
                                        />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-text-secondary">
                                            No performance data available.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pie Chart */}
                            <div className="bg-surface border border-[var(--color-white-5)] rounded-2xl p-6">
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                                    <Database size={20} className="text-electric-blue" />
                                    Asset Allocation
                                </h3>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={allocation}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {allocation?.map((_: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#121223', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                                itemStyle={{ color: '#E2E8F0' }}
                                                formatter={(value: any) => [`PKR ${Number(value).toLocaleString()}`, 'Investment']}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Custom Legend */}
                                <div className="flex flex-wrap justify-center gap-4 mt-4">
                                    {allocation?.map((entry: any, index: number) => (
                                        <div key={`legend-${index}`} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                            <span className="text-xs text-text-secondary">{entry.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Portfolio Repository (Grouped by Bank) */}
                        <div className="pb-8">
                            <div className="bg-surface border border-[var(--color-white-5)] rounded-2xl p-6 flex flex-col">
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2 shrink-0">
                                    <FileText size={20} className="text-neon-purple" />
                                    Portfolio Repository
                                </h3>
                                
                                <div className="space-y-8">
                                    {(() => {
                                        // Group holdings by Bank
                                        const banks = Array.from(new Set(holdings.map(h => h.bank)));
                                        
                                        if (banks.length === 0) {
                                            return (
                                                <div className="py-12 text-center">
                                                    <p className="text-text-secondary">No statements found. Upload an FMR or PDF to begin tracking.</p>
                                                </div>
                                            );
                                        }

                                        return banks.map(bankName => {
                                            const bankHoldings = holdings.filter(h => h.bank === bankName);
                                            // Unique portfolios within this bank
                                            const portfolioNumbers = Array.from(new Set(bankHoldings.map(h => h.portfolio_account || 'Unknown Account')));
                                            
                                            return (
                                                <div key={bankName} className="space-y-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-6 bg-neon-purple rounded-full" />
                                                        <h4 className="font-bold text-text-primary uppercase tracking-widest text-sm">{bankName}</h4>
                                                    </div>
                                                    
                                                    <div className="flex flex-wrap gap-3">
                                                        {portfolioNumbers.map(pNo => (
                                                            <button
                                                                key={pNo}
                                                                onClick={() => {
                                                                    const stmtHoldings = bankHoldings.filter(h => h.portfolio_account === pNo);
                                                                    setSelectedStatement({
                                                                        bank: bankName,
                                                                        portfolio: pNo,
                                                                        holdings: stmtHoldings
                                                                    });
                                                                    setIsStatementModalOpen(true);
                                                                }}
                                                                className="px-6 py-4 bg-[var(--color-white-5)] border border-[var(--color-white-10)] rounded-2xl hover:bg-neon-purple/20 hover:border-neon-purple transition-all group relative overflow-hidden flex flex-col items-start min-w-[200px]"
                                                            >
                                                                <span className="text-[10px] text-text-secondary group-hover:text-neon-purple transition-colors uppercase font-bold tracking-tighter mb-1">Portfolio</span>
                                                                <span className="text-sm font-mono font-bold text-text-primary group-hover:text-white transition-colors">{pNo}</span>
                                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <ArrowUpRight size={16} className="text-neon-purple" />
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calculator Modal Overlay */}
                {isCalculatorModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-surface border border-[var(--color-white-10)] rounded-3xl p-8 max-w-lg w-full shadow-2xl relative">
                            <button
                                onClick={() => setIsCalculatorModalOpen(false)}
                                className="absolute top-4 right-4 p-2 text-text-secondary hover:text-white bg-[var(--color-white-5)] hover:bg-[var(--color-white-10)] rounded-full transition-colors"
                            >
                                <Zap size={16} className="rotate-45" /> {/* Close Icon Approximation */}
                            </button>

                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-neon-purple/20 text-neon-purple rounded-2xl">
                                    <Calculator size={28} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold">Zakat Calculator</h2>
                                    <p className="text-sm text-text-secondary">Estimated liabilities based on current Net Worth</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="p-4 bg-[var(--color-white-5)] rounded-2xl flex justify-between items-center">
                                    <span className="text-text-secondary">Total Net Worth</span>
                                    <span className="font-bold text-lg">PKR {(summary.total_net_worth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>

                                <div className="p-4 bg-[var(--color-white-5)] border border-accent-pink/20 rounded-2xl flex justify-between items-center group hover:border-accent-pink/50 transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-accent-pink font-semibold">Zakat Liability</span>
                                            <span className="text-xs px-2 py-0.5 bg-accent-pink/10 text-accent-pink rounded-md">2.5%</span>
                                        </div>
                                        <p className="text-xs text-text-secondary mt-1">Calculated on Total Net Worth</p>
                                    </div>
                                    <span className="font-bold text-lg text-accent-pink">
                                        - PKR {((summary.total_net_worth || 0) * 0.025).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                <div className="pt-4 mt-2 border-t border-[var(--color-white-10)] flex justify-between items-center">
                                    <span className="font-bold text-text-secondary">Post-Zakat Net Worth</span>
                                    {(() => {
                                        const zakat = (summary.total_net_worth || 0) * 0.025;
                                        const finalAmount = (summary.total_net_worth || 0) - zakat;
                                        return (
                                            <span className="font-bold text-2xl text-success">
                                                PKR {finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Fund Performance Modal Overlay */}
                {isPerformanceModalOpen && selectedBank && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-surface border border-neon-purple/20 rounded-3xl p-6 md:p-8 max-w-5xl w-full h-[90vh] shadow-2xl relative flex flex-col">
                            <button
                                onClick={() => setIsPerformanceModalOpen(false)}
                                className="absolute top-4 right-4 p-2 text-text-secondary hover:text-white bg-[var(--color-white-5)] hover:bg-danger/20 rounded-full transition-colors z-10"
                            >
                                <Zap size={16} className="rotate-45" /> {/* Close Icon Approximation */}
                            </button>

                            <div className="flex items-center gap-3 mb-6 shrink-0 z-0">
                                <div className="p-3 bg-neon-purple/20 text-neon-purple rounded-2xl">
                                    <TrendingUp size={28} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                                        {selectedBank} <span className="text-neon-purple">Fund Performances</span>
                                    </h2>
                                    <p className="text-sm text-text-secondary flex items-center gap-1">
                                        <Info size={14} /> MUFAP Verified Data
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden flex flex-col gap-6">
                                {/* Search Bar & Filters */}
                                <div className="flex flex-col md:flex-row gap-4 shrink-0">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            placeholder={`Search ${selectedBank} funds...`}
                                            value={fundSearchQuery}
                                            onChange={(e) => setFundSearchQuery(e.target.value)}
                                            className="w-full bg-[var(--color-white-5)] border border-[var(--color-white-10)] rounded-xl px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:border-neon-purple transition-colors"
                                        />
                                        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary w-4 h-4" />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 text-sm text-text-secondary">
                                            <Filter size={16} /> Filters:
                                        </div>
                                        <select
                                            value={selectedCategoryFilter || ""}
                                            onChange={e => setSelectedCategoryFilter(e.target.value || null)}
                                            className="bg-[var(--color-white-5)] border border-[var(--color-white-10)] rounded-xl px-4 py-3 text-sm outline-none focus:border-neon-purple text-text-primary custom-select shadow-sm"
                                        >
                                            <option value="" className="bg-[#1a1625] text-white py-2">All Categories</option>
                                            <option value="Money Market" className="bg-[#1a1625] text-white py-2">Money Market</option>
                                            <option value="Income" className="bg-[#1a1625] text-white py-2">Income / Debt</option>
                                            <option value="Equity" className="bg-[#1a1625] text-white py-2">Equity / Stock</option>
                                        </select>
                                        <select
                                            value={selectedRiskFilter || ""}
                                            onChange={e => setSelectedRiskFilter(e.target.value || null)}
                                            className="bg-[var(--color-white-5)] border border-[var(--color-white-10)] rounded-xl px-4 py-3 text-sm outline-none focus:border-neon-purple text-text-primary custom-select shadow-sm"
                                        >
                                            <option value="" className="bg-[#1a1625] text-white py-2">All Risk Profiles</option>
                                            <option value="Low" className="bg-[#1a1625] text-success py-2">Low Risk</option>
                                            <option value="Medium" className="bg-[#1a1625] text-warning py-2">Medium Risk</option>
                                            <option value="High" className="bg-[#1a1625] text-danger py-2">High Risk</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Table of Funds */}
                                <div className="bg-black/20 rounded-2xl border border-[var(--color-white-5)] overflow-hidden flex-1 flex flex-col">
                                    <div className="overflow-auto custom-scrollbar flex-1">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-[var(--color-white-5)] text-text-secondary text-xs uppercase tracking-wider bg-[var(--color-white-5)]">
                                                    <th className="py-3 px-4 font-semibold">Fund Name</th>
                                                    <th className="py-3 px-4 font-semibold hover:text-white cursor-pointer transition-colors" onClick={() => handleSort('nav')}>Latest NAV {sortConfig?.key === 'nav' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                                    <th className="py-3 px-4 font-semibold text-right hover:text-white cursor-pointer transition-colors" onClick={() => handleSort('return_1m')}>1 Month {sortConfig?.key === 'return_1m' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                                    <th className="py-3 px-4 font-semibold text-right hover:text-white cursor-pointer transition-colors" onClick={() => handleSort('return_6m')}>6 Month {sortConfig?.key === 'return_6m' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                                    <th className="py-3 px-4 font-semibold text-right hover:text-white cursor-pointer transition-colors" onClick={() => handleSort('return_1y')}>1 Year {sortConfig?.key === 'return_1y' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                                    <th className="py-3 px-4 font-semibold text-right hover:text-white cursor-pointer transition-colors" onClick={() => handleSort('return_ytd')}>YTD {sortConfig?.key === 'return_ytd' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    let filteredFunds = bankPerformanceData.filter(f =>
                                                        f.fund_name.toLowerCase().includes(fundSearchQuery.toLowerCase()) ||
                                                        f.short_name?.toLowerCase().includes(fundSearchQuery.toLowerCase())
                                                    );

                                                    if (selectedRiskFilter) {
                                                        filteredFunds = filteredFunds.filter(f => f.risk_profile?.toLowerCase().includes(selectedRiskFilter.toLowerCase()));
                                                    }
                                                    if (selectedCategoryFilter) {
                                                        filteredFunds = filteredFunds.filter(f =>
                                                            f.fund_type?.toLowerCase().includes(selectedCategoryFilter.toLowerCase()) ||
                                                            f.category?.toLowerCase().includes(selectedCategoryFilter.toLowerCase())
                                                        );
                                                    }

                                                    if (sortConfig) {
                                                        filteredFunds.sort((a, b) => {
                                                            const aVal = sortConfig.key === 'nav' ? (a.latest_nav || -999) : (a.metrics?.[sortConfig.key] || -999);
                                                            const bVal = sortConfig.key === 'nav' ? (b.latest_nav || -999) : (b.metrics?.[sortConfig.key] || -999);
                                                            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                                                            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                                                            return 0;
                                                        });
                                                    }

                                                    if (bankPerformanceData.length === 0) {
                                                        return (
                                                            <tr>
                                                                <td colSpan={6} className="py-8 text-center text-text-secondary">
                                                                    No daily performance data available for {selectedBank}. This might mean the scraper hasn't run yet or no funds matched.
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    if (filteredFunds.length === 0) {
                                                        return (
                                                            <tr>
                                                                <td colSpan={6} className="py-8 text-center text-text-secondary">
                                                                    No funds found matching "{fundSearchQuery}".
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    return filteredFunds.map((fund: any) => (
                                                        <React.Fragment key={fund.fund_id}>
                                                            <tr
                                                                onClick={() => setExpandedFundId(expandedFundId === fund.fund_id ? null : fund.fund_id)}
                                                                className="border-b border-[var(--color-white-5)] hover:bg-[var(--color-white-5)] transition-colors cursor-pointer group"
                                                            >
                                                                <td className="py-3 px-4 text-text-primary flex md:items-center items-start gap-3">
                                                                    <div className="mt-1 md:mt-0 shrink-0">
                                                                        {expandedFundId === fund.fund_id ? <ChevronUp size={16} className="text-neon-purple" /> : <ChevronDown size={16} className="text-text-secondary group-hover:text-neon-purple transition-colors" />}
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-semibold group-hover:text-neon-purple transition-colors line-clamp-2 md:line-clamp-none">
                                                                            {fund.fund_name} {fund.short_name && <span className="text-text-secondary text-xs font-normal ml-2 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">{fund.short_name}</span>}
                                                                        </p>
                                                                        {(fund.fund_type || fund.risk_profile) && (
                                                                            <div className="flex flex-wrap gap-2 mt-1.5">
                                                                                {fund.fund_type && fund.fund_type !== "Unknown" && <span className="text-[10px] bg-[var(--color-white-10)] text-text-primary px-2 py-0.5 rounded-full border border-[var(--color-white-10)]">{fund.fund_type}</span>}
                                                                                {fund.risk_profile && fund.risk_profile !== "Unknown" && <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${fund.risk_profile === 'High' ? 'bg-danger/10 text-danger border border-danger/20' : fund.risk_profile.includes('Mod') || fund.risk_profile === 'Medium' ? 'bg-warning/10 text-warning border border-warning/20' : 'bg-success/10 text-success border border-success/20'}`}>{fund.risk_profile} Risk</span>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="py-3 px-4 font-mono">PKR {fund.latest_nav?.toFixed(4) || '---'}</td>

                                                                {/* 1M Return */}
                                                                <td className={`py-3 px-4 text-right font-medium ${fund.metrics?.return_1m >= 0 ? 'text-success' : 'text-danger'}`}>
                                                                    {fund.metrics?.return_1m}%
                                                                </td>

                                                                {/* 6M Return */}
                                                                <td className={`py-3 px-4 text-right font-medium ${fund.metrics?.return_6m >= 0 ? 'text-success' : 'text-danger'}`}>
                                                                    {fund.metrics?.return_6m}%
                                                                </td>

                                                                {/* 1Y Return */}
                                                                <td className={`py-3 px-4 text-right font-medium ${fund.metrics?.return_1y >= 0 ? 'text-success' : 'text-danger'}`}>
                                                                    {fund.metrics?.return_1y}%
                                                                </td>

                                                                {/* YTD Return */}
                                                                <td className={`py-3 px-4 text-right font-medium ${fund.metrics?.return_ytd >= 0 ? 'text-success' : 'text-danger'}`}>
                                                                    {fund.metrics?.return_ytd}%
                                                                </td>
                                                            </tr>
                                                            {expandedFundId === fund.fund_id && (
                                                                <tr className="bg-black/40 relative">
                                                                    <td colSpan={6} className="p-6 md:pl-12">
                                                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-neon-purple shadow-[0_0_10px_rgba(139,92,246,0.5)]"></div>
                                                                        <div className="flex items-start gap-4 max-w-4xl">
                                                                            <div className="p-3 bg-neon-purple/20 text-neon-purple rounded-2xl shrink-0 hidden md:block">
                                                                                <Database size={24} />
                                                                            </div>
                                                                            <div>
                                                                                <h4 className="text-sm font-bold text-text-primary mb-2 tracking-wide uppercase flex items-center gap-2">
                                                                                    Fund Asset Allocation Dashboard
                                                                                </h4>
                                                                                <p className="text-sm text-text-secondary leading-relaxed tracking-wide">
                                                                                    {fund.asset_allocation && fund.asset_allocation !== "Unknown" ? fund.asset_allocation : "Asset allocation details are currently empty. Upload the latest FMR PDF for this bank via the Upload FMR button in the header to intelligently extract this data."}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    ));
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Statement Details Modal Overlay */}
                {isStatementModalOpen && selectedStatement && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                        <div className="bg-surface border border-neon-purple/20 rounded-3xl p-6 md:p-8 max-w-5xl w-full h-[85vh] shadow-2xl relative flex flex-col">
                            <button
                                onClick={() => setIsStatementModalOpen(false)}
                                className="absolute top-4 right-4 p-2 text-text-secondary hover:text-white bg-[var(--color-white-5)] hover:bg-danger/20 rounded-full transition-colors z-10"
                            >
                                <Zap size={16} className="rotate-45" />
                            </button>

                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-neon-purple/20 text-neon-purple rounded-2xl">
                                        <FileText size={28} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold tracking-tight">Statement Details</h2>
                                        <p className="text-sm text-text-secondary">Viewing latest holdings for Portfolio: <span className="font-mono text-neon-purple">{selectedStatement.portfolio}</span></p>
                                    </div>
                                </div>
                                <div className="hidden md:block px-4 py-2 bg-neon-purple/10 border border-neon-purple/20 rounded-xl">
                                    <span className="text-xs font-bold text-neon-purple uppercase tracking-widest">{selectedStatement.bank}</span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[var(--color-white-5)] text-text-secondary text-xs uppercase tracking-wider">
                                            <th className="py-4 font-semibold">Fund Name</th>
                                            <th className="py-4 font-semibold">Category</th>
                                            <th className="py-4 font-semibold text-right">Units</th>
                                            <th className="py-4 font-semibold text-right">NAV</th>
                                            <th className="py-4 font-semibold text-right">Market Value</th>
                                            <th className="py-4 font-semibold text-right">Gain / Loss</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedStatement.holdings.map((h: any, idx: number) => (
                                            <tr key={idx} className="border-b border-[var(--color-white-5)] hover:bg-[var(--color-white-2)] transition-colors group">
                                                <td className="py-4">
                                                    <p className="font-semibold text-text-primary group-hover:text-neon-purple transition-colors">{h.fund_name}</p>
                                                </td>
                                                <td className="py-4 text-xs">
                                                    <span className="px-2 py-1 bg-[var(--color-white-5)] rounded-md border border-[var(--color-white-10)]">{h.category}</span>
                                                </td>
                                                <td className="py-4 text-right font-mono text-sm">{h.units.toLocaleString()}</td>
                                                <td className="py-4 text-right font-mono text-sm">PKR {h.nav.toFixed(4)}</td>
                                                <td className="py-4 text-right font-bold text-text-primary">
                                                    PKR {h.market_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="py-4 text-right">
                                                    {h.gain_loss !== 0 ? (
                                                        <>
                                                            <p className={`font-bold ${h.gain_loss >= 0 ? 'text-success' : 'text-danger'}`}>
                                                                {h.gain_loss >= 0 ? '+' : ''}PKR {h.gain_loss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </p>
                                                            <p className={`text-[10px] ${h.gain_loss >= 0 ? 'text-success/80' : 'text-danger/80'}`}>
                                                                {h.percentage_change.toFixed(2)}%
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <span className="text-text-secondary text-xs italic">Not Provided</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

const NavItem = ({ icon, label, active, isOpen, onClick }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-200 group
      ${active
                ? 'bg-neon-purple text-white shadow-lg shadow-neon-purple/20 font-medium'
                : 'text-text-secondary hover:bg-[var(--color-white-5)] hover:text-text-primary'
            }
      ${!isOpen && 'justify-center'}
    `}
        title={!isOpen ? label : ''}
    >
        <span className={`${active ? 'text-white' : 'text-text-secondary group-hover:text-neon-purple'} transition-colors`}>
            {icon}
        </span>
        {isOpen && <span className="whitespace-nowrap">{label}</span>}
    </button>
);

const KPICard = ({ title, value, trend, trendUp, icon, subtitle, info }: any) => (
    <div className="bg-surface border border-[var(--color-white-5)] rounded-2xl p-6 hover:border-[var(--color-white-10)] transition-all hover:shadow-lg hover:shadow-neon-purple/5 group relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:scale-110 transition-transform duration-500">
            {icon}
        </div>
        <h3 className="text-text-secondary text-sm font-medium mb-2">{title}</h3>
        <p className="text-2xl font-bold text-text-primary mb-2">{value}</p>
        {subtitle ? (
            <p className="text-xs text-text-secondary">{subtitle}</p>
        ) : info ? (
            <p className="text-xs text-text-secondary">{info}</p>
        ) : (
            <div className={`flex items-center gap-1 text-sm ${trendUp ? 'text-success' : 'text-danger'}`}>
                {trendUp ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                <span className="font-medium">{trend}</span>
                <span className="text-text-secondary ml-1 text-xs font-normal">vs last month</span>
            </div>
        )}
    </div>
);

export default Dashboard;
