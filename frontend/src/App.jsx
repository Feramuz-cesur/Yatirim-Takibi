import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import './index.css';

function App() {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
  
  const [banks, setBanks] = useState([]);
  const [rates, setRates] = useState({}); // { bankSlug: { buyPrice, sellPrice } }
  const [loadingRates, setLoadingRates] = useState(false);
  
  // Investments state (now synced with Firebase)
  const [investments, setInvestments] = useState([]);

  // Read from Firestore
  useEffect(() => {
    const q = query(collection(db, 'investments'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invs = [];
      snapshot.forEach((docItem) => {
        invs.push({ id: docItem.id, ...docItem.data() });
      });
      setInvestments(invs);
    });
    return () => unsubscribe();
  }, []);

  // UI States
  const [pnlView, setPnlView] = useState('CURRENT'); // 'CURRENT' | 'ALL_TIME'
  const [showPortfolioBreakdown, setShowPortfolioBreakdown] = useState(false);

  // Add Form States
  const [formType, setFormType] = useState('BUY'); // 'BUY' | 'SELL'
  const [formBank, setFormBank] = useState('');
  const [formInputMode, setFormInputMode] = useState('GRAM'); // 'GRAM' | 'TRY'
  const [formAmount, setFormAmount] = useState('');
  const [formAutoPrice, setFormAutoPrice] = useState(true);
  const [formManualPrice, setFormManualPrice] = useState('');

  // 1. Fetch supported banks
  useEffect(() => {
    fetch(`${API_URL}/banks`)
      .then(res => res.json())
      .then(data => {
        setBanks(data);
        if (data.length > 0 && !formBank) setFormBank(data[0].slug);
      })
      .catch(err => console.error("Error fetching banks:", err));
  }, []);

  // 2. Determine which bank rates we need to fetch
  const banksToFetch = useMemo(() => {
    const set = new Set();
    if (formBank) set.add(formBank);
    investments.forEach(inv => set.add(inv.bankSlug));
    return Array.from(set);
  }, [formBank, investments]);

  // 3. Fetch Rates
  useEffect(() => {
    if (banksToFetch.length === 0) return;

    const fetchRates = async () => {
      setLoadingRates(true);
      try {
        const newRates = { ...rates };
        await Promise.all(banksToFetch.map(async (slug) => {
          const res = await fetch(`${API_URL}/rates/${slug}`);
          const data = await res.json();
          newRates[slug] = data;
        }));
        setRates(newRates);
      } catch (error) {
        console.error("Error fetching multiple rates:", error);
      } finally {
        setLoadingRates(false);
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, 60000); // refresh every minute
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banksToFetch.join(',')]); // re-run if the required banks change


  // --- CALCULATIONS ---

  const { portfolio, grandTotals } = useMemo(() => {
    // portfolio maps bankSlug -> { grams, totalCost, avgCost, realizedPnL }
    const port = {};

    // Sort investments by chronological order (we use timestamp)
    const sortedInv = [...investments].sort((a, b) => a.timestamp - b.timestamp);

    sortedInv.forEach(txn => {
      if (!port[txn.bankSlug]) {
        port[txn.bankSlug] = { grams: 0, totalCost: 0, avgCost: 0, realizedPnL: 0, bankName: banks.find(b => b.slug === txn.bankSlug)?.name || txn.bankSlug };
      }
      const b = port[txn.bankSlug];

      if (txn.type === 'BUY') {
        b.totalCost = (b.grams * b.avgCost) + (txn.amountGrams * txn.pricePerGram);
        b.grams += txn.amountGrams;
        b.avgCost = b.grams > 0 ? b.totalCost / b.grams : 0;
      } else if (txn.type === 'SELL') {
        b.realizedPnL += (txn.pricePerGram - b.avgCost) * txn.amountGrams;
        b.grams = Math.max(0, b.grams - txn.amountGrams); // clamp to 0 just in case
        b.totalCost = b.grams * b.avgCost; // update total cost base for remaining
      }
    });

    // Calculate Grand Totals
    let totalGrams = 0;
    let totalRealizedPnL = 0;
    let totalCurrentValue = 0;
    let totalUnrealizedPnL = 0;
    let totalCostBase = 0;

    Object.keys(port).forEach(slug => {
      const b = port[slug];
      const currentRate = rates[slug];
      
      // If user sells to bank, bank uses its BUY price
      const currentPrice = currentRate ? currentRate.buyPrice : 0; 
      const currentValue = b.grams * currentPrice;
      const unrealized = (currentPrice - b.avgCost) * b.grams;

      b.cachedPrice = currentPrice;
      b.currentValue = currentValue;
      b.unrealizedPnL = unrealized;

      totalGrams += b.grams;
      totalRealizedPnL += b.realizedPnL;
      totalCurrentValue += currentValue;
      totalUnrealizedPnL += unrealized;
      totalCostBase += b.totalCost;
    });

    return {
      portfolio: port,
      grandTotals: {
        grams: totalGrams,
        realizedPnL: totalRealizedPnL,
        currentValue: totalCurrentValue,
        unrealizedPnL: totalUnrealizedPnL,
        costBase: totalCostBase,
        avgCost: totalGrams > 0 ? totalCostBase / totalGrams : 0,
      }
    };
  }, [investments, rates, banks]);


  // Add Investment Logic
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!formAmount || !formBank) return;

    const currentBankRate = rates[formBank];
    // Bank's selling price is our BUYING price. Bank's buying price is our SELLING price.
    const autoPrice = formType === 'BUY' ? currentBankRate?.sellPrice : currentBankRate?.buyPrice;
    
    let pricePerGram = 0;
    if (formAutoPrice) {
      if (!autoPrice) {
        alert("Güncel banka fiyatı henüz çekilemedi, lütfen biraz bekleyin veya manuel fiyat girin.");
        return;
      }
      pricePerGram = autoPrice;
    } else {
      if (!formManualPrice) return;
      pricePerGram = parseFloat(formManualPrice);
    }

    let grams = 0;
    if (formInputMode === 'GRAM') {
      grams = parseFloat(formAmount);
    } else {
      // TRY mode -> calculate grams
      grams = parseFloat(formAmount) / pricePerGram;
    }

    if (grams <= 0 || pricePerGram <= 0) return;

    // Check if enough balance to sell
    if (formType === 'SELL') {
      const bankBalance = portfolio[formBank]?.grams || 0;
      if (grams > bankBalance) {
        alert(`Yetersiz bakiye! ${portfolio[formBank]?.bankName || formBank} bankasında sadece ${bankBalance.toFixed(2)} gramınız var.`);
        return;
      }
    }

    const newTxn = {
      type: formType,
      bankSlug: formBank,
      amountGrams: grams,
      pricePerGram: pricePerGram,
      timestamp: Date.now(),
      date: new Date().toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' })
    };

    try {
      await addDoc(collection(db, 'investments'), newTxn);
      setFormAmount('');
      if (!formAutoPrice) setFormManualPrice('');
    } catch (err) {
      console.error("Firebase error", err);
      alert("Kayıt sırasında hata oluştu. Lütfen bağlantınızı kontrol edin.");
    }
  };

  const removeInvestment = async (id) => {
    if (window.confirm('Bu işlemi silmek istediğinize emin misiniz?')) {
      try {
        await deleteDoc(doc(db, 'investments', id));
      } catch (err) {
        console.error("Delete error", err);
      }
    }
  };


  // Values to display based on PnL View toggle
  const displayPnL = pnlView === 'CURRENT' 
    ? grandTotals.unrealizedPnL 
    : (grandTotals.unrealizedPnL + grandTotals.realizedPnL);
    
  const displayCostBase = pnlView === 'CURRENT'
    ? grandTotals.costBase
    : (grandTotals.costBase); // Could be interpreted differently, but cost base of current is fine.

  const displayPnLPercentage = displayCostBase > 0 ? (displayPnL / displayCostBase) * 100 : 0;


  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center pb-20">
      <header className="w-full max-w-5xl flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-yellow-200 drop-shadow-sm">
            Altın Varlıklarım
          </h1>
          <p className="text-slate-400 mt-2 font-medium">Banka kurları ile gerçek zamanlı portföy yönetimi</p>
        </div>
      </header>

      <main className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* --- MAIN SUMMARY CARD --- */}
        <div className="md:col-span-3 bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div className="flex-1">
              <p className="text-slate-400 font-medium mb-1 uppercase tracking-wider text-sm">Toplam Varlık (Net)</p>
              <p className="text-5xl font-bold text-slate-50">{grandTotals.grams.toFixed(2)} <span className="text-2xl text-yellow-500 font-medium">gr</span></p>
              <p className="text-slate-300 mt-2 font-medium">{grandTotals.currentValue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺ <span className="text-slate-500 text-sm font-normal">(Güncel Değer)</span></p>
            </div>
            
            <div className="h-24 w-px bg-slate-700 hidden md:block"></div>
            
            <div className="flex-1">
               <div className="bg-slate-900/60 rounded-xl p-1 mb-4 flex border border-slate-700/50">
                  <button 
                    onClick={() => setPnlView('CURRENT')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${pnlView === 'CURRENT' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Güncel Kâr
                  </button>
                  <button 
                    onClick={() => setPnlView('ALL_TIME')}
                    className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${pnlView === 'ALL_TIME' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Şimdiye Kadar
                  </button>
               </div>

               <div className="flex items-end justify-between">
                 <div>
                    <p className="text-sm font-medium mb-1 text-slate-400">Net Kâr / Zarar</p>
                    <p className={`text-4xl font-bold ${displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {displayPnL > 0 ? '+' : ''}{displayPnL.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
                    </p>
                 </div>
                 <div className={`text-right pb-1 ${displayPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    <span className="text-3xl font-bold bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-700/30">
                      {displayPnLPercentage > 0 ? '+' : ''}{displayPnLPercentage.toFixed(2)}%
                    </span>
                 </div>
               </div>
            </div>
          </div>

          {/* Portfolio Breakdown Button */}
          <div className="mt-8 border-t border-slate-700/50 pt-5">
            <button 
              onClick={() => setShowPortfolioBreakdown(!showPortfolioBreakdown)}
              className="w-full flex justify-between items-center text-slate-300 hover:text-white bg-slate-900/40 p-3 rounded-xl border border-slate-700/50 hover:bg-slate-700/40 transition-all font-medium"
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                Banka Varlık Dağılımını Göster
              </div>
              <svg className={`w-5 h-5 transition-transform ${showPortfolioBreakdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>

            {/* Breakdown Content */}
            {showPortfolioBreakdown && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-down">
                {Object.keys(portfolio).filter(s => portfolio[s].grams > 0).length === 0 ? (
                  <p className="text-slate-500 text-center py-4 col-span-2">Henüz portföyünüzde varlık bulunmuyor.</p>
                ) : (
                  Object.keys(portfolio).filter(s => portfolio[s].grams > 0).map(slug => {
                    const b = portfolio[slug];
                    return (
                      <div key={slug} className="bg-slate-900/60 p-4 rounded-xl border border-slate-700/50 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-200">{b.bankName}</p>
                          <p className="text-sm text-slate-400 mt-1">{b.grams.toFixed(2)} gr Altın</p>
                        </div>
                        <div className="text-right">
                          <p className="text-slate-200 font-semibold">{b.currentValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</p>
                          <p className={`text-sm font-medium mt-1 ${b.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {b.unrealizedPnL >= 0 ? '+' : ''}{b.unrealizedPnL.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ Kâr
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- ADD TRANSACTION FORM --- */}
        <div className="md:col-span-1 bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-6 shadow-xl flex flex-col h-full">
          <h2 className="text-xl font-bold text-slate-100 mb-5 flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Yeni İşlem Ekle
          </h2>
          
          <form onSubmit={handleAddTransaction} className="flex flex-col gap-4 flex-1">
            
            {/* Type Toggle */}
            <div className="flex bg-slate-900/60 rounded-xl border border-slate-700/50 p-1">
              <button type="button" onClick={() => setFormType('BUY')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formType === 'BUY' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/50' : 'text-slate-400 hover:text-slate-200'}`}>ALIŞ</button>
              <button type="button" onClick={() => setFormType('SELL')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formType === 'SELL' ? 'bg-red-600/30 text-red-400 border border-red-500/50' : 'text-slate-400 hover:text-slate-200'}`}>SATIŞ</button>
            </div>

            {/* Bank Select */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 flex justify-between">
                İşlem Yapılan Banka
                {loadingRates && <span className="text-yellow-500 text-xs animate-pulse">Kur güncelleniyor...</span>}
              </label>
              <select 
                className="w-full bg-slate-900 border border-slate-700/70 text-slate-100 rounded-xl py-2.5 px-3 focus:ring-2 focus:ring-yellow-500/50 outline-none transition-all cursor-pointer"
                value={formBank}
                onChange={(e) => setFormBank(e.target.value)}
              >
                {banks.map(bank => (
                  <option key={bank.slug} value={bank.slug}>{bank.name}</option>
                ))}
              </select>
            </div>

            {/* Bank Live Rates Info */}
            <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50 text-xs font-medium text-slate-400 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="opacity-70">Banka Alışı</p>
                <p className="text-sm text-slate-200 mt-1">{rates[formBank]?.buyPrice?.toLocaleString('tr-TR') || '-'} ₺</p>
              </div>
              <div>
                <p className="opacity-70">Banka Satışı</p>
                <p className="text-sm text-slate-200 mt-1">{rates[formBank]?.sellPrice?.toLocaleString('tr-TR') || '-'} ₺</p>
              </div>
              <div>
                <p className="opacity-70">Makas</p>
                <p className="text-sm text-yellow-500 mt-1">
                  {rates[formBank] && rates[formBank].buyPrice ? (rates[formBank].sellPrice - rates[formBank].buyPrice).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '-'} ₺
                </p>
              </div>
            </div>

            <div className="h-px w-full bg-slate-700/50 my-1"></div>

            {/* Amount / Value */}
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-300">İşlem Miktarı</label>
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
                  <button type="button" onClick={() => setFormInputMode('GRAM')} className={`px-2 text-xs font-bold rounded-md ${formInputMode === 'GRAM' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>GRAM</button>
                  <button type="button" onClick={() => setFormInputMode('TRY')} className={`px-2 text-xs font-bold rounded-md ${formInputMode === 'TRY' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>TL</button>
                </div>
              </div>
              <div className="relative">
                <input 
                  type="number" step="0.001" required
                  className="w-full bg-slate-900 border border-slate-700/70 rounded-xl py-3 pl-4 pr-12 text-slate-100 font-medium placeholder-slate-600 focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 transition-all"
                  placeholder={formInputMode === 'GRAM' ? 'Örn: 25.5' : 'Örn: 50000'}
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                />
                <span className="absolute right-4 top-3.5 text-slate-500 font-bold">{formInputMode === 'GRAM' ? 'GR' : '₺'}</span>
              </div>
            </div>

            {/* Price */}
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm font-medium text-slate-300">Kur Fiyatı (1 Gram)</label>
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700">
                  <button type="button" onClick={() => setFormAutoPrice(true)} className={`px-2 text-xs font-bold rounded-md transition-colors ${formAutoPrice ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>ANLIK</button>
                  <button type="button" onClick={() => setFormAutoPrice(false)} className={`px-2 text-xs font-bold rounded-md transition-colors ${!formAutoPrice ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>MANUEL</button>
                </div>
              </div>
              <div className="relative">
                <input 
                  type="number" step="0.01" required={!formAutoPrice} disabled={formAutoPrice}
                  className={`w-full border rounded-xl py-3 pl-4 pr-10 font-medium transition-all ${formAutoPrice ? 'bg-slate-800/50 border-slate-700 text-yellow-500/80' : 'bg-slate-900 border-slate-700/70 text-slate-100 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500'}`}
                  placeholder={formAutoPrice ? "Bankanın anlık kilitli taban fiyatı" : "Örn: 2450.50"}
                  value={formAutoPrice ? (formType === 'BUY' ? rates[formBank]?.sellPrice : rates[formBank]?.buyPrice) || '' : formManualPrice}
                  onChange={(e) => setFormManualPrice(e.target.value)}
                />
                <span className="absolute right-4 top-3.5 text-slate-500">₺</span>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <button 
                type="submit"
                className={`w-full font-bold py-3.5 rounded-xl shadow-lg transform transition-all active:scale-95 text-slate-950 flex justify-center items-center gap-2 ${formType === 'BUY' ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 shadow-emerald-500/20' : 'bg-gradient-to-r from-red-500 to-red-400 hover:from-red-400 hover:to-red-300 shadow-red-500/20'}`}
              >
                {formType === 'BUY' ? 'Alış İşlemini Kaydet' : 'Satış İşlemini Kaydet'}
              </button>
            </div>
          </form>
        </div>

        {/* --- TRANSACTIONS LIST --- */}
        <div className="md:col-span-2 bg-slate-800/60 backdrop-blur-xl border border-slate-700/60 rounded-3xl p-6 shadow-xl flex flex-col h-full">
          <div className="flex justify-between items-center mb-6 border-b border-slate-700/70 pb-3">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
              İşlem Geçmişi
            </h2>
            <span className="text-xs font-bold text-slate-300 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700">{investments.length} Kayıt</span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3" style={{ maxHeight: '550px' }}>
            {investments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10 opacity-60">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p>Henüz işlem eklenmedi.</p>
              </div>
            ) : (
              // Show descending
              [...investments].sort((a,b)=> b.id - a.id).map((inv) => {
                const bankName = banks.find(b => b.slug === inv.bankSlug)?.name || inv.bankSlug;
                const isBuy = inv.type === 'BUY';
                
                // PnL display for each transaction logic
                // If Buy: we calculate current unrealized PnL based on bank's buy price.
                // If Sell: we could just display it as "Satış İşlemi" without unrealized PnL, because it's realized and already locked in the past.
                let pnlText = "";
                let isProfit = false;
                
                if (isBuy) {
                  const currentBankBuy = rates[inv.bankSlug]?.buyPrice;
                  if (currentBankBuy) {
                    const diff = (currentBankBuy - inv.pricePerGram) * inv.amountGrams;
                    isProfit = diff >= 0;
                    pnlText = `${isProfit ? '+' : ''}${diff.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺ Kar/Zarar`;
                  }
                }

                return (
                  <div key={inv.id} className="group bg-slate-900/50 border border-slate-700/50 rounded-2xl p-4 flex justify-between items-center hover:bg-slate-800/80 hover:border-slate-600 transition-all relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${isBuy ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                    
                    <div className="flex items-center gap-4 pl-2">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isBuy ? 'AL' : 'SAT'}
                      </div>
                      <div>
                        <p className="text-slate-100 font-bold">{inv.amountGrams.toFixed(2)} Gr <span className="text-slate-400 text-sm font-normal ml-1">({bankName})</span></p>
                        <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{inv.date}</span>
                          <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                          <span>Kur: {inv.pricePerGram.toLocaleString('tr-TR')} ₺</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-slate-200 font-bold">{(inv.amountGrams * inv.pricePerGram).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</p>
                        {isBuy ? (
                          <p className={`text-xs font-bold mt-1 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {pnlText || "Hesaplanıyor..."}
                          </p>
                        ) : (
                          <p className={`text-xs font-bold mt-1 text-slate-500`}>Gerçekleşmiş İşlem</p>
                        )}
                        
                      </div>
                      <button 
                        onClick={() => removeInvestment(inv.id)}
                        className="text-slate-600 hover:text-red-400 p-2.5 rounded-xl hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="İşlemi Sil"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

export default App;
