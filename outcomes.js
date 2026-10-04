// Saved historical outcomes only. A positive ending PnL never erases a liquidation.
function outcomeState(m){
 if(m.Market!=='FUTURES')return 'SPOT';
 if(m.Liquidated===true||Number.isFinite(m.LiquidationCount)&&m.LiquidationCount>0)return 'LIQUIDATED';
 if(m.Liquidated!==false||!Number.isFinite(m.LiquidationCount)||m.LiquidationCount!==0||!Number.isFinite(m.NetProfit))return 'UNKNOWN';
 return m.TotalTrades===0?'NO_TRADE':m.NetProfit>0?'PROFIT':m.NetProfit<0?'LOSS':'FLAT';
}
const outcomeLabels={LIQUIDATED:'曾爆仓',PROFIT:'未爆仓 · 盈利',LOSS:'未爆仓 · 亏损',FLAT:'未爆仓 · 持平',NO_TRADE:'未交易',UNKNOWN:'待核实',SPOT:'现货 · 不参与合约筛选'};
function outcomeBadge(s){return `<strong class="outcome-badge outcome-${s}">${outcomeLabels[s]||'待核实'}</strong>`;}
function outcomePnl(v){return Number.isFinite(v)?`${v>0?'+':''}${num(v)}`:'待核实';}
function outcomeParams(m){return `回撤 ${pct(m.DrawdownPct)} / 止盈 ${pct(m.TakeProfitPct)} · ${num(m.EffectiveLeverage)} 倍 · 再跌目标 ${pct(m.LiquidationDropPct)}`;}
function renderOutcomes(r){
 const s=r.OutcomeSummary;if(!s){$('outcomeSummary').textContent='本记录尚无盈亏分类，请刷新更新后的站点。';return;}
 const c=s.Counts;
 $('outcomeScope').textContent=`当前已完成区间：${r.Config.StartDate} → ${r.Config.EndDate} UTC · ${num(s.Total)} 个合约模型（现货 ${num(s.SpotModelsExcluded)} 个另列） · ${r.AuditCoverage?.Status==='PASS'?'三项计算审计通过':'独立审计未通过或覆盖不全，结论待复核'}`;
 $('outcomeSummary').innerHTML=[['曾爆仓',c.LIQUIDATED,`${num(s.LiquidationEvents)} 次强平；即使期末盈利也计入`,'negative'],['未爆仓且盈利',c.PROFIT,'扣除已计手续费、资金费，含浮盈亏','positive'],['未爆仓但亏损',c.LOSS,'没有爆仓，也可能损失大部分本金','negative'],['持平 / 未交易 / 待核实',`${num(c.FLAT)} / ${num(c.NO_TRADE)} / ${num(c.UNKNOWN)}`,'缺少风险字段不能当成未爆仓','neutral']].map(([k,v,n,t])=>`<div class="stat-tile tone-${t}"><span>${k}</span><strong>${typeof v==='number'?num(v):v}</strong><small>${n}</small></div>`).join('');
 const b=s.BestSurvivor;
 $('survivorChampion').innerHTML=b?`<div><span class="eyebrow">${b.NetProfit>0?'本期未爆仓 · 净利润最高':b.NetProfit<0?'本期未爆仓 · 亏损最少（没有盈利组合）':'本期未爆仓 · 最好结果为持平'}</span><h3 class="${b.NetProfit>0?'tone-positive':'tone-negative'}">净利润 ${outcomePnl(b.NetProfit)} USDT · ${pct(b.TotalReturnPct)}</h3><p>${outcomeParams(b)}</p><p class="tone-risk"><b>最大回撤 ${pct(b.MaxDrawdownPct)}</b> · 最近距强平 ${pct(b.ClosestDistanceToLiquidationPct)} · ${b.OpenTrades?'期末仍持仓，利润含浮盈亏':'期末空仓'}</p></div><button data-outcome-view="${esc(b.StrategyID)}">查看逐笔交易 ↗</button>`:'没有可核实且实际交易过的未爆仓合约模型。';
}
let cycleRiskData=null,cycleRiskPage=0,cycleRiskRevision=0;
async function loadCycleRisk(id){
 const ticket=++cycleRiskRevision;cycleRiskData=null;cycleRiskPage=0;
 $('cycleRiskSummary').textContent='正在核对同参数的跨周期记录…';$('cycleRiskPeriods').innerHTML='';$('cycleRiskRows').innerHTML='';$('cycleRiskWinner').innerHTML='';
 try{const data=await api('/api/cycle-risk?run='+encodeURIComponent(id));if(ticket!==cycleRiskRevision)return;cycleRiskData=data;renderCycleRisk();}
 catch(e){if(ticket===cycleRiskRevision)$('cycleRiskSummary').textContent='跨周期比较未完成：'+e.message+'。不能把未加载的周期视为未爆仓。';}
}
function filteredCycleRows(){
 if(!cycleRiskData)return [];
 const filter=$('cycleRiskFilter').value,raw=$('cycleRiskMaxDD').value,dd=raw===''?null:Number(raw);
 return cycleRiskData.Rows.filter(r=>(filter==='ALL'||filter==='ALL_SAFE'&&r.AllSurvived||filter==='ANY_LIQ'&&r.AnyLiquidated||filter==='INCOMPLETE'&&!r.Complete)&&(dd===null||Number.isFinite(dd)&&dd>=0&&dd<=100&&r.Periods.every(c=>c&&Number.isFinite(c.MaxDrawdownPct)&&c.MaxDrawdownPct<=dd)));
}
function renderCycleRisk(){
 const d=cycleRiskData;if(!d)return;
 $('cycleRiskSummary').textContent=`同参数合约组合 ${num(d.Rows.length)} 个 · 四段均未爆仓 ${num(d.AllSurvivedCount)} · 任一段曾爆仓 ${num(d.AnyLiquidatedCount)} · 覆盖不全 ${num(d.IncompleteCount)}。按连续全程净利润降序；不是将三个周期的冠军拼接。`;
 $('cycleRiskMeaning').textContent=d.Meaning;
 $('cycleRiskPeriods').innerHTML='<table><thead><tr><th>时间段 / UTC</th><th>曾爆仓</th><th>未爆仓盈利</th><th>未爆仓亏损</th><th>查看已完成结果</th></tr></thead><tbody>'+d.Periods.map(p=>`<tr><td><b>${esc(p.Label)}</b><small>${esc(p.Start)} → ${esc(p.End)}</small></td>${p.Summary?`<td class="tone-negative">${num(p.Summary.Counts.LIQUIDATED)}</td><td class="tone-positive">${num(p.Summary.Counts.PROFIT)}</td><td class="tone-negative">${num(p.Summary.Counts.LOSS)}</td><td><button data-cycle-run="${esc(p.Run)}">查看 ${num(p.Summary.Total)} 个合约 ↗</button><small>记录 ${esc(p.Run)}</small></td>`:'<td colspan="4">缺少同配置且审计通过的完整周期记录，不参与未爆仓判定</td>'}</tr>`).join('')+'</tbody></table>';
 const winner=d.BestAllSurvived,w=winner?.Periods[3];
 $('cycleRiskWinner').innerHTML=w?`<strong>四段均未爆仓中，${w.NetProfit>0?'全程净利润最高':w.NetProfit<0?'全程亏损最少':'全程最好持平'}：</strong>${outcomeParams(winner.Parameters)}<br><b class="${w.NetProfit>0?'tone-positive':'tone-negative'}">${outcomePnl(w.NetProfit)} USDT（${pct(w.TotalReturnPct)}）</b> · <b class="tone-risk">全程最大回撤 ${pct(w.MaxDrawdownPct)}</b> · 最近距强平 ${pct(w.ClosestDistanceToLiquidationPct)}。这是历史筛选结果，不是低风险推荐。`:'没有四段完整、每段实际交易且均未爆仓的组合，无法给出这一条件下的冠军。';
 const rows=filteredCycleRows(),size=20;cycleRiskPage=Math.min(cycleRiskPage,Math.max(0,Math.ceil(rows.length/size)-1));
 $('cycleRiskHead').innerHTML='<tr><th>同一组参数</th>'+d.Periods.map(p=>`<th>${esc(p.Label)}</th>`).join('')+'</tr>';
 $('cycleRiskRows').innerHTML=rows.slice(cycleRiskPage*size,(cycleRiskPage+1)*size).map(r=>`<tr><td><b>回撤 ${pct(r.Parameters.DrawdownPct)}<br>止盈 ${pct(r.Parameters.TakeProfitPct)}</b><small>${num(r.Parameters.EffectiveLeverage)} 倍 · 再跌目标 ${pct(r.Parameters.LiquidationDropPct)}</small><small>${r.AllSurvived?'四段均未爆仓':r.AnyLiquidated?'至少一段曾爆仓':'覆盖不全'}</small></td>`+r.Periods.map((c,i)=>`<td>${c?`${outcomeBadge(c.State)}<strong class="cycle-pnl ${c.NetProfit>0?'tone-positive':c.NetProfit<0?'tone-negative':'tone-neutral'}">${outcomePnl(c.NetProfit)} U</strong><small>收益 ${pct(c.TotalReturnPct)} · 回撤 ${pct(c.MaxDrawdownPct)}</small><small>爆仓 ${num(c.LiquidationCount)} 次 · ${c.OpenTrades?'期末持仓':'期末空仓'}</small><button class="text" data-cycle-run="${esc(d.Periods[i].Run)}" data-cycle-model="${esc(c.StrategyID)}">交易明细 ↗</button>`:'待核实 / 未覆盖'}</td>`).join('')+'</tr>').join('')||'<tr><td colspan="5">没有符合这些条件的组合。</td></tr>';
 $('cycleRiskCount').textContent=`筛选后 ${num(rows.length)} / ${num(d.Rows.length)} 个 · 第 ${cycleRiskPage+1} / ${Math.max(1,Math.ceil(rows.length/size))} 页`;
 $('cycleRiskPrev').disabled=cycleRiskPage===0;$('cycleRiskNext').disabled=(cycleRiskPage+1)*size>=rows.length;
}
function exportCycleRisk(){
 if(!cycleRiskData)return;
 const records=filteredCycleRows().map(r=>{const row={...r.Parameters,AllPeriodsCovered:r.Complete,AllPeriodsNoLiquidation:r.AllSurvived};r.Periods.forEach((c,i)=>{const p=cycleRiskData.Periods[i];row[p.Key+'_Run']=p.Run;row[p.Key+'_StartUTC']=p.Start;row[p.Key+'_EndUTC']=p.End;row[p.Key+'_ReportSHA256']=p.ReportSHA256;for(const key of ['State','StrategyID','NetProfit','TotalReturnPct','MaxDrawdownPct','LiquidationCount','OpenTrades','ClosestDistanceToLiquidationPct'])row[p.Key+'_'+key]=c?.[key]??'UNAVAILABLE';});return row;});
 if(!records.length)return;
 const cols=Object.keys(records[0]),csv='\ufeff'+[cols,...records.map(r=>cols.map(k=>r[k]))].map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='BTC-同参数跨周期盈亏与爆仓.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
if(typeof module!=='undefined')module.exports={outcomeState};
if(typeof document!=='undefined'){
 document.addEventListener('click',async e=>{
  const quick=e.target.closest('[data-outcome-filter]'),view=e.target.closest('[data-outcome-view]'),cycle=e.target.closest('[data-cycle-run]');
  try{
   if(quick){$('group').value='FUTURES';$('outcomeFilter').value=quick.dataset.outcomeFilter;$('sort').value='NetProfit';$('maxDrawdownFilter').value='';$('minTradesFilter').value='0';$('excludeLiquidated').checked=false;page=0;await loadModels();$('modelsHead').scrollIntoView({behavior:'smooth',block:'center'});}
   if(view)await viewStrategy(view.dataset.outcomeView);
   if(cycle){const id=cycle.dataset.cycleRun;await loadReport(id);$('history').value=id;applyConfig(currentReport.Config);if(cycle.dataset.cycleModel)await viewStrategy(cycle.dataset.cycleModel);else $('outcomePanel').scrollIntoView({behavior:'smooth'});}
  }catch(ex){error(ex.message);}
 });
 document.addEventListener('DOMContentLoaded',()=>{
  for(const id of ['cycleRiskFilter','cycleRiskMaxDD'])$(id).addEventListener('input',()=>{cycleRiskPage=0;renderCycleRisk();});
  $('cycleRiskPrev').onclick=()=>{cycleRiskPage--;renderCycleRisk();};$('cycleRiskNext').onclick=()=>{cycleRiskPage++;renderCycleRisk();};$('cycleRiskExport').onclick=exportCycleRisk;
 });
}
