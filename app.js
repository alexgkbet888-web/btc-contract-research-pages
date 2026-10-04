// UTC boundaries supplied by the user. Do not slide the last endpoint to today.
const cyclePresets=[
 {id:'bear-1',label:'第一周期 · 图示熊市',start:'2021-11-08T07:00',end:'2022-11-01T11:00'},
 {id:'bull-2',label:'第二周期 · 图示牛市',start:'2022-11-01T11:00',end:'2025-10-12T17:00'},
 {id:'bear-3',label:'第三周期 · 图示熊市',start:'2025-10-12T17:00',end:'2026-10-02T04:00',note:'未结束 · 截至原回测'},
 {id:'all',label:'连续全程 · 跨越三个周期',start:'2021-11-08T07:00',end:'2026-10-02T04:00'}
];
function cycleUtcInput(value,end=false){
 const text=String(value),dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(text);
 const zoned=/(Z|[+-]\d{2}:\d{2})$/.test(text)?text:dateOnly?text+'T00:00:00Z':text+'Z';
 const ms=Date.parse(zoned)+(end&&dateOnly?86400000:0);
 return Number.isFinite(ms)?new Date(ms).toISOString().slice(0,16):'';
}
function selectedCycle(start,end){return cyclePresets.find(p=>p.start===start&&p.end===end)?.id||null;}
function syncCycleSelection(){
 const f=document.getElementById('parameters');if(!f)return;
 const selected=selectedCycle(f.elements.StartDate.value,f.elements.EndDate.value);
 for(const b of document.querySelectorAll('[data-cycle-id]')){
  b.classList.toggle('selected',b.dataset.cycleId===selected);
  b.setAttribute('aria-pressed',String(b.dataset.cycleId===selected));
 }
 const note=document.getElementById('cyclePresetNote');
 if(note)note.textContent=selected?'已选择截图中的 UTC 区间；结束时间不含该时刻。可导出参数后在本地回测；右侧为已发布结果。':'自定义 UTC 区间；结束时间不含该时刻。';
}
function installCyclePresets(){
 const fmt=t=>t.replace('T',' ');
 for(const host of document.querySelectorAll('[data-cycle-presets]')){
  host.innerHTML='<div class="cycle-heading"><strong>历史周期 · 快速选择</strong><span>UTC</span></div>'+cyclePresets.map(p=>`<button type="button" class="cycle-preset" data-cycle-id="${p.id}" aria-pressed="false"><strong>${p.label}</strong>${p.note?`<span class="cycle-note">${p.note}</span>`:''}<span>${fmt(p.start)} →<br>${fmt(p.end)}</span></button>`).join('');
  host.addEventListener('click',e=>{
   const button=e.target.closest('[data-cycle-id]');if(!button)return;
   const preset=cyclePresets.find(p=>p.id===button.dataset.cycleId),f=document.getElementById('parameters');
   f.elements.StartDate.value=preset.start;f.elements.EndDate.value=preset.end;
   // These hour boundaries are exact 5m bars, but do not align to all larger bars.
   f.elements.Timeframe.value='5m';
   if(host.dataset.cycleTarget==='backtest')studioTab('backtest');
   const aside=f.closest('aside'),toggle=aside.querySelector('[data-controls-toggle]');
   if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();
   updateEstimate();syncCycleSelection();
   document.getElementById('cyclePresetNote').textContent=`已填入「${preset.label}」，K 线周期设为 5m。结束时间不含该时刻；请导出参数后在本地运行；已有结果保持原运行记录。`;
   if(host.dataset.cycleTarget==='backtest')f.elements.StartDate.focus();
  });
 }
}
if(typeof module!=='undefined')module.exports={cyclePresets,cycleUtcInput,selectedCycle};
if(typeof document!=='undefined')installCyclePresets();

// Main console application
const $ = id => document.getElementById(id);
const form = $('parameters');
let reportRequest=0, modelsRequest=0;
let defaults, base, runId, currentReport, page = 0, modelTotal = 0, jobTimer, userJobBusy=false, researchBusy=false;
const num = x => x == null || x === '' ? '—' : Number(x).toLocaleString('en-US',{maximumFractionDigits:2});
const esc = x => String(x ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = x => x == null ? '—' : `${num(x)}%`;
function syncRunButton(){if(window.BTC_PAGES){$('runButton').disabled=true;$('runButton').textContent='批量回测请使用本地版';return;}const busy=userJobBusy||researchBusy;$('runButton').disabled=busy;$('runButton').innerHTML=busy?'正在运行，请等待完成':'开始批量回测 <span>→</span>';}
function error(message){$('error').hidden=!message;$('error').textContent=message||'';}
async function api(path, body){if(window.btcStaticApi)return window.btcStaticApi(path,body);const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json','X-Backtest-Console':'1'},body:JSON.stringify(body)}:{});const value=await response.json();if(!response.ok)throw Error(value.error||response.statusText);return value;}
function applyConfig(config){base={...defaults,...config};for(const input of form.elements){if(!input.name||!(input.name in base))continue;if(input.type==='checkbox')input.checked=base[input.name];else input.value=['StartDate','EndDate'].includes(input.name)?cycleUtcInput(base[input.name],input.name==='EndDate'):Array.isArray(base[input.name])?base[input.name].join(','):base[input.name];}updateEstimate();syncCycleSelection();}
function getConfig(){const config={...base};for(const input of form.elements){if(!input.name)continue;config[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):['StartDate','EndDate'].includes(input.name)?input.value+'Z':input.name==='LiquidationDrops'?input.value.split(/[,，/\s]+/).filter(Boolean).map(Number):input.value;}return config;}
function updateEstimate(){try{const c=getConfig();$('manual').hidden=c.LeverageMode!=='MANUAL';const count=(a,b,s)=>s>0&&b>=a?Math.floor((b-a)/s+1e-8)+1:0;const d=count(c.DrawdownStart,c.DrawdownEnd,c.TwoStage?c.CoarseDrawdownStep:c.DrawdownStep);const t=count(c.TakeProfitStart,c.TakeProfitEnd,c.TwoStage?c.CoarseTakeProfitStep:c.TakeProfitStep);const f=c.IncludeFutures?(c.LeverageMode==='MANUAL'?count(c.LeverageStart,c.LeverageEnd,c.LeverageStep):c.LiquidationDrops.length):0;$('estimate').textContent=num(d*t*(f+Number(c.IncludeSpot)));$('estimateLabel').textContent=c.TwoStage?'粗搜模型数 · 精搜另计':'预计模型总数';}catch{}}
const fileUrl = name => `./files/${encodeURIComponent(runId)}/${name}`;
function metric(label,value,detail,gain=false){return `<div class="metric"><span class="label">${esc(label)}</span><strong class="${gain==='loss'?'tone-negative':gain?'gain':''}">${esc(value)}</strong><small>${esc(detail).replace(/最大回撤 ([\d.,]+%)/g,'<span class="tone-risk">最大回撤 $1</span>')}</small></div>`;}
async function loadHistory(select){const runs=await api('/api/runs');renderAuditHistory(runs);$('history').innerHTML=runs.map(r=>`<option value="${esc(r.id)}">${esc(r.id.replace('_',' '))} · ${num(r.models)} 模型 · ${esc(r.timeframe)} · ${r.AuditCoverage?.Status==='PASS'?'审计通过':r.AuditCoverage?.Status==='FAIL'?'复核有差异':'审计未全覆盖'}</option>`).join('');if(!runs.length){$('period').textContent='还没有完成的回测';return;}const chosen=select||[...runs].sort((a,b)=>b.models-a.models)[0].id;$('history').value=chosen;await loadReport(chosen);applyConfig(currentReport.Config);}
async function loadReport(id){const request=++reportRequest;++modelsRequest;error('');const loaded=await api(`/api/report?run=${encodeURIComponent(id)}`);if(request!==reportRequest)return;runId=id;currentReport=loaded;const r=currentReport,c=r.Config;page=0;$('period').textContent=`${c.StartDate.replace("T"," ").replace("Z","")} → ${c.EndDate.replace("T"," ").replace("Z","")} · UTC`;$('resultMeta').textContent=`${c.Timeframe} · 初始 ${num(c.InitialCapital)} USDT · ${c.CapitalMode==='COMPOUND'?'复利':'固定本金'} · ${num(r.TotalModels)} 个模型 · 耗时 ${num(r.ElapsedSeconds)} 秒`;
if(r.Computation)$('resultMeta').textContent+=` · 已审计计算复用 ${num(r.Computation.ReusedModels)} · 新计算 ${num(r.Computation.ComputedModels)}`;
const top=r.Highlights.HighestReturn,spot=r.Highlights.SpotBest,bh=r.BuyHold;$('metrics').innerHTML=metric('全模型收益冠军 · 不限爆仓',num(top.FinalEquity),`${outcomeLabels[outcomeState(top)]} · 收益 ${pct(top.TotalReturnPct)} · 最大回撤 ${pct(top.MaxDrawdownPct)}`,top.TotalReturnPct<0?'loss':true)+metric('现货最佳模型 · 最终资产',spot?num(spot.FinalEquity):'未扫描',spot?`回撤 ${pct(spot.DrawdownPct)} / 止盈 ${pct(spot.TakeProfitPct)}`:'可在参数区开启现货')+metric('BTC Buy & Hold · 最终资产',num(bh.BuyHoldFinalEquity),`收益 ${pct(bh.BuyHoldReturnPct)} · 最大回撤 ${pct(bh.BuyHoldMaxDrawdownPct)}`);
$('group').innerHTML='<option value="FUTURES">全部合约</option><option value="ALL">合约 + 现货</option>'+Object.keys(r.GroupTop3).map(g=>`<option value="${esc(g)}">${g==='SPOT'?'现货':g.startsWith('LIQ_')?'允许再跌 '+g.slice(4)+'%':'杠杆 '+g.slice(4)+' 倍'}</option>`).join('');$('allCsv').href=fileUrl('all_models.csv?download=1');$('reportJson').href=fileUrl('report.json?download=1');$('reportConfig').textContent=JSON.stringify(c,null,2);$('assumptions').innerHTML=r.Assumptions.map(t=>`<li>${esc(t)}</li>`).join('');$('zones').innerHTML=r.RobustZones.map(z=>`<span class="zone">${esc(z.Group)} · ${z.Label==='POSSIBLE OVERFITTING'?'可能过拟合':z.Label==='ROBUST ZONE'?'局部稳健':esc(z.Label)} · 邻点 ${z.GoodNeighbors}/${z.TestedNeighbors}</span>`).join('');$('heatmap').innerHTML=(r.Heatmaps||[]).map(n=>`<option value="${esc(n)}">${n.includes('max_drawdown')?'最大回撤':'最终资产'} · ${esc(n.replace('heatmap_','').replace('max_drawdown_','').replace('.png',''))}</option>`).join('');renderOutcomes(r);loadCycleRisk(id);renderOverview(r);showHeatmap();renderQuality(r);renderComparison(r);await loadModels();}
function showHeatmap(){const name=$('heatmap').value;$('heatmapImage').hidden=!name;if(name)$('heatmapImage').src=fileUrl(name);}
async function loadModels(){if(!runId)return;const request=++modelsRequest;const size=Number($('pageSize').value);const r=await api(`/api/models?run=${runId}&group=${encodeURIComponent($('group').value)}&sort=${$('sort').value}&limit=${size}&page=${page}&maxDrawdown=${encodeURIComponent($('maxDrawdownFilter').value)}&minTrades=${encodeURIComponent($('minTradesFilter').value||'0')}&excludeLiquidated=${$('excludeLiquidated').checked?'1':'0'}&outcome=${encodeURIComponent($('outcomeFilter').value)}`);if(request!==modelsRequest)return;modelTotal=r.total;renderRanking(r.rows,size);$('count').textContent=`共 ${num(r.total)} 个模型 · 第 ${page+1} / ${Math.max(1,Math.ceil(r.total/size))} 页`;$('prev').disabled=page===0;$('next').disabled=(page+1)*size>=r.total;}
async function viewStrategy(id){const r=await api(`/api/trades?run=${runId}&strategy=${encodeURIComponent(id)}`);const m=r.model;$('tradeTitle').textContent=`${id} · 回撤 ${pct(m.DrawdownPct)} / 止盈 ${pct(m.TakeProfitPct)}`;$('tradeSummary').innerHTML=metric('最终资产',num(m.FinalEquity),`净利润 ${num(m.NetProfit)} USDT`,m.NetProfit<0?'loss':true)+metric('最大回撤',pct(m.MaxDrawdownPct),`最差 MAE ${pct(m.WorstTradeMAEPct)}`)+metric('累计成本',num(m.TotalFees+m.TotalFunding),`手续费 ${num(m.TotalFees)} · Funding ${num(m.TotalFunding)}`);const columns=[['TradeNumber','#'],['EntryDateTime','入场时间 UTC'],['EntryPrice','入场价'],['EffectiveLeverage','实际杠杆'],['PositionNotional','名义金额'],['TheoreticalLiquidationPrice','理论强平价'],['TakeProfitPrice','止盈价'],['ExitDateTime','退出时间 UTC'],['ExitPrice','退出价'],['HoldingDays','持仓天数'],['MAEPct','MAE %'],['FundingCost','资金费'],['TotalFee','手续费'],['NetProfit','净利润'],['EquityAfterTrade','交易后权益'],['Result','状态']];$('tradeHead').innerHTML='<tr>'+columns.map(([,title])=>`<th>${title}</th>`).join('')+'</tr>';$('trades').innerHTML=r.trades.map(t=>'<tr>'+columns.map(([key])=>`<td>${esc(key.includes('DateTime')?t[key]?.replace('T',' ').replace('+00:00','')||'—':key==='Result'?t[key]:num(t[key]))}</td>`).join('')+'</tr>').join('');renderCurve(r.curve);renderModelMetrics(m);$('modelJson').textContent=JSON.stringify(m,null,2);$('tradeCsv').href=fileUrl(`trade_history/${id}.csv?download=1`);$('tradeDialog').showModal();}
function jobFailureMessage(j){
 const lines=j.lines||[];
 const failure=[...lines].reverse().find(line=>/BACKTEST FAILED:/.test(line));
 let reason=failure?failure.replace(/^.*BACKTEST FAILED:\s*/, ''):j.error||'任务异常结束，请查看运行日志。';
 if(reason.includes('OFFICIAL_ARCHIVE_UNAVAILABLE')){
  const url=reason.match(/https:\/\/[^\s]+?\.CHECKSUM|https:\/\/[^\s]+?\.zip/);
  reason=`币安官方归档或校验文件不可用（HTTP 404）${url?'：'+url[0]:''}。文件可能尚未发布，当前要求的归档核验无法完成。请等待官方文件可用，或选择已有归档的历史区间；关闭离线模式不能解决此错误。`;
 }
 let hint='';
 if(/Offline archive missing|Missing official REST response/.test(reason))hint=' 当前为离线模式且缓存不完整，请关闭离线模式后重新下载并校验。';
 else if(/404/.test(reason)&&!reason.includes('关闭离线模式不能解决'))hint=' 数据源返回 404；文件可能尚未发布。请检查日志中的来源和日期，关闭离线模式不一定能解决。';
 return `回测未完成：${reason}${hint} 本次没有有效排名；下方如有结果，属于之前已完成的运行。`;
}
async function pollJob(id){try{const j=await api('/api/job?id='+id);$('progressPanel').hidden=false;$('progressText').textContent=`${num(j.completed)} / ${num(j.total)}${j.eta!=null?' · 预计剩余 '+num(j.eta)+' 秒':''}`;$('progress').value=j.total?100*j.completed/j.total:0;$('jobLog').textContent=(j.lines||[]).join('\n');$('jobLogDetails').open=j.status==='FAILED';$('progressPanel').classList.toggle('completed-job',j.status==='COMPLETE');userJobBusy=j.status==='RUNNING';syncRunButton();$('jobTitle').textContent=j.status==='RUNNING'?'正在批量回测':j.status==='COMPLETE'?'回测完成':'回测失败';if(j.status==='RUNNING'){jobTimer=setTimeout(()=>pollJob(id),1500);}else if(j.status==='COMPLETE'&&j.run){$('progress').value=100;await loadHistory(j.run);}else if(j.status==='FAILED'){error(jobFailureMessage(j));}}catch(e){error(e.message);userJobBusy=false;syncRunButton();}}
form.addEventListener('input',()=>{updateEstimate();syncCycleSelection();});form.addEventListener('change',()=>{updateEstimate();syncCycleSelection();});
form.addEventListener('submit',async e=>{e.preventDefault();error('');userJobBusy=true;syncRunButton();try{const j=await api('/api/run',{config:getConfig(),offline:$('offline').checked});await pollJob(j.id);}catch(e){error(e.message);userJobBusy=false;syncRunButton();}});
$('reset').onclick=()=>applyConfig(defaults);
$('save').onclick=()=>{const b=new Blob([JSON.stringify(getConfig(),null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='backtest_config.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
$('import').onclick=()=>$('fileInput').click();$('fileInput').onchange=async()=>{try{const c=JSON.parse(await $('fileInput').files[0].text());await api('/api/estimate',{config:c});applyConfig(c);error('');}catch(e){error(e.message);}finally{$('fileInput').value='';}};
$('history').onchange=()=>loadReport($('history').value).then(()=>applyConfig(currentReport.Config)).catch(e=>error(e.message));for(const id of ['group','sort','pageSize','metricView','outcomeFilter'])$(id).onchange=()=>{page=0;loadModels().catch(e=>error(e.message));};$('prev').onclick=()=>{page--;loadModels().catch(e=>error(e.message));};$('next').onclick=()=>{page++;loadModels().catch(e=>error(e.message));};$('models').onclick=e=>{const b=e.target.closest('[data-view]');if(b)viewStrategy(b.dataset.view).catch(e=>error(e.message));};$('heatmap').onchange=showHeatmap;$('closeDialog').onclick=()=>$('tradeDialog').close();
(async()=>{try{const health=await api('/api/health');$('connection').textContent=health.mode==='CLOUD_INDEPENDENT'?'独立云端 · 在线':health.mode==='SHARED_RESEARCH'?'在线共享 · 已连接':health.mode==='PUBLIC_TEST'?'公开测试 · 在线':'本地研究 · 在线';if(health.mode==='PUBLIC_TEST'){const note=$('deploymentNotice');note.hidden=false;note.textContent='公开测试版 · 无需登录 · 所有测试结果公开共享。每次最多 120 模型 / 93 天 / 2 进程；同一时间运行一个任务。使用币安官方归档及 SHA256 校验。完整历史周期请在本地运行。';$('offline').checked=false;document.querySelector('[name=DataSource]').disabled=true;document.querySelector('[name=VerifyWithArchive]').disabled=true;document.querySelector('[name=VerifyWithArchive]').parentElement.lastChild.textContent='币安官方归档 SHA256 校验';document.querySelector('footer').textContent='BTCUSDT · 公开测试实例 · 历史模拟 · 无交易下单功能';}if(health.mode==='SHARED_RESEARCH'){const note=$('deploymentNotice');note.hidden=false;note.textContent='公开共享版 · 与本地共用完整历史、行情缓存、配比结果和计算后台；无独立测试版的区间或模型限制。同一时间运行一个任务，结果对所有访客公开。未提交的表单仅保留在当前浏览器。';document.querySelector('footer').textContent='BTCUSDT · 本地 / 线上共用后台 · 历史模拟 · 无交易下单功能';}if(health.mode==='CLOUD_INDEPENDENT'){const note=$('deploymentNotice');note.hidden=false;note.textContent='独立云端 · 无需口令 · 数据与计算在云服务器运行，与本地记录分开保存。所有访客共享云端结果；一次运行一个计算任务。';document.querySelector('footer').textContent='BTCUSDT · 独立云端 · 本地与线上数据互不覆盖';}if(health.mode==='GITHUB_PAGES'){$('connection').textContent='GitHub Pages · 免费独立站';$('deploymentNotice').hidden=false;$('deploymentNotice').textContent='免费独立站 · 历史结果为发布快照，包含全部已发布模型与逐笔交易。关闭本地电脑仍可访问；新批量回测和配比扫描请在本地运行，再发布更新。04 合约模拟在浏览器计算，记录仅保存在当前浏览器，建议导出备份。';document.querySelector('footer').textContent='BTCUSDT · GitHub Pages 免费历史研究站 · v1.7.9 · 不下单';syncRunButton();}defaults=await api('/api/config');applyConfig(defaults);await loadHistory();pollResearch();pollSystem();const job=await api('/api/active');if(job.status==='RUNNING')pollJob(job.id);}catch(e){$('connection').textContent='连接失败';error(e.message);}})();

function renderOverview(r){
 const o=r.Overview;if(!o){$('overviewStats').textContent='统计将在服务更新后加载';return;}
 $('overviewStats').innerHTML=[['期末盈利模型占比',pct(o.profitablePct),`盈利 ${num(o.profitableModels)} · 亏损 ${num(o.losingModels)} / ${num(o.validReturns)} 个有效模型`,o.profitablePct>0?'positive':'negative'],['收益中位数',pct(o.medianReturnPct),'避免仅观察冠军模型',o.medianReturnPct<0?'negative':'positive'],['回撤中位数',pct(o.medianDrawdownPct),'保守 OHLC 风险包络','risk'],['发生强平',num(o.liquidatedModels),`${num(o.liquidationEvents)} 次强平 · 期末持仓 ${num(o.openModels)}（浮亏 ${num(o.openLossModels)}）`,'risk']].map(([label,v,n,t])=>`<div><span>${label}</span><strong class="tone-${t}">${v}</strong><small>${n}</small></div>`).join('');
 $('returnDistribution').innerHTML=o.returnDistribution.map((b,i)=>`<div class="dist-item"><span>${esc(b.label)}</span><meter min="0" max="${o.population||1}" value="${b.count}" aria-label="${esc(b.label)}收益模型数量"></meter><strong>${num(b.count)}</strong></div>`).join('');
 $('overviewScope').textContent=o.scope+' 本策略只在止盈或强平时平仓，未平仓浮亏不进入已平仓胜率；请同时查看期末收益、浮亏和强平。';
}
$('applyRisk').onclick=()=>{page=0;loadModels().catch(e=>error(e.message));};
$('clearRisk').onclick=()=>{$('outcomeFilter').value='ALL';$('maxDrawdownFilter').value='';$('minTradesFilter').value='0';$('excludeLiquidated').checked=false;page=0;loadModels().catch(e=>error(e.message));};
