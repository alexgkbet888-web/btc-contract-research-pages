(() => {
 const precise=(v,d=6)=>Number(v).toLocaleString('zh-CN',{maximumFractionDigits:d});
 const form=$('simForm');let ref=null,quote=null,rows=[],parentId=null,lastDeleted=null,result=null,timer=null,revision=0,loaded=false,saving=false;
 const field=name=>form.elements.namedItem(name);
 function syncEntry(){
  const manual=field('entryPriceMode').value==='manual',price=Number(field('price').value);
  field('entryDrop').min=manual?'':'0';field('entryDrop').max=manual?'':'99';
  // The field remains editable in both directions; derived values use full precision.
  if(Number.isFinite(price)&&price>0){
   if(manual){const entry=Number(field('entryPrice').value);field('entryDrop').value=field('entryPrice').value!==''&&Number.isFinite(entry)&&entry>0?String(Number(((1-entry/price)*100).toFixed(10))):'';}
   else{const drop=Number(field('entryDrop').value);field('entryPrice').value=field('entryDrop').value!==''&&Number.isFinite(drop)&&drop>=0&&drop<=99?String(price*(1-drop/100)):'';}
  }else if(!manual)field('entryPrice').value='';
  $('simEntryHint').textContent=manual?'以手填入场价计算，回撤比例已反算（负数表示高于参考价）。修改参考价或回撤比例可恢复自动计算。':'自动计算：参考价格 ×（1 − 回撤比例）。也可以直接修改入场价格。';
 }
 const message=(text,bad=false)=>{$('simMessage').textContent=text;$('simMessage').className=bad?'error':'micro';};
 function inputs(){const v={linkRisk:true};for(const e of form.elements){if(e.name)v[e.name]=e.type==='number'?(e.value===''?null:Number(e.value)):e.value;}if(v.leverageMode==='manual'&&(v.maxDrop==null||v.maxDrop<0||v.maxDrop>100))v.maxDrop=0;return v;}
 function controls(){
  const auto=field('feeMode').value==='auto';for(const key of ['entryFee','exitFee'])field(key).readOnly=auto;
  field('leverage').readOnly=false;field('capital').readOnly=!!parentId;
  field('mmr').readOnly=!!ref?.brackets;field('exitPrice').disabled=field('exitMode').value!=='custom';
  if(ref&&auto){field('entryFee').value=+(ref[field('entryRole').value]*100).toFixed(6);field('exitFee').value=+(ref[field('exitRole').value]*100).toFixed(6);}
 }
 function render(r){
  field('entryPrice').value=String(r.entryPrice);
  if(r.entryPriceMode==='manual')field('entryDrop').value=String(Number(r.entryDropPct.toFixed(10)));
  result=r;const priceCard=(label,v,tone)=>`<div class="sim-price ${tone}"><span>${label}</span><strong>${num(Math.round(v*1e8)/1e8)}</strong><small>USDT</small></div>`;
  $('simPrices').innerHTML=priceCard('回撤入场价',r.entryPrice,'tone-ratio')+priceCard('目标止盈价',r.takeProfitPrice,'tone-positive')+priceCard('估算爆仓价',r.liquidationPrice,'tone-negative')+priceCard('可接受再跌目标价',r.targetRiskPrice,'tone-risk');
  $('simRisk').hidden=false;$('simRisk').className=r.riskWithinTolerance&&!r.liquidated?'notice sim-safe':'notice sim-danger';
  $('simRisk').textContent=r.liquidated?'模拟平仓价已触及估算爆仓线：本期保守按本金全部损失记账，不能继续复利。':`入场后距估算爆仓价 ${num(r.actualDropPct)}% · ${r.riskWithinTolerance?'满足':'不满足'}所填 ${num(r.maxDropPct)}% 再跌距离。${r.riskWithinTolerance?'':'请降低杠杆，或使用按风险距离反算。'}`;
  const metrics=[['杠杆',r.leverage,'×','ratio'],['开仓名义价值',r.notional,' USDT','neutral'],['模拟数量',r.quantity,' BTC','neutral'],['初始保证金',r.initialMargin,' USDT','neutral'],['开仓手续费',r.entryFee,' USDT','risk'],['平仓手续费',r.exitFee,' USDT','risk'],['累计资金费假设',r.fundingCost,' USDT','risk'],['模拟平仓价',r.exitPrice,' USDT','ratio'],['本期净盈亏',r.netPnL,' USDT',r.netPnL>=0?'positive':'negative'],['本金收益率',r.returnPct,'%',r.returnPct>=0?'positive':'negative'],['期末可用本金',r.endingCapital,' USDT','positive']];
  $('simMetrics').innerHTML=metrics.map(([label,value,unit,tone])=>`<div class="stat-tile tone-${tone}"><span>${label}</span><strong>${unit===' BTC'?precise(value,8):unit==='×'?precise(value,6):num(value)}<small>${unit}</small></strong></div>`).join('');
  $('simMethod').textContent=`${r.feeLabel}；${r.marginLabel}。${r.assumptions}`;
  if(r.linkRisk){
   if(field('leverageMode').value==='risk')field('leverage').value=String(r.leverage);
   else field('maxDrop').value=String(r.actualDropPct);
   if(!r.liquidated)$('simRisk').textContent=`参数已联动 · ${field('leverageMode').value==='risk'?'按再跌距离反算杠杆':'按杠杆计算再跌距离'} · ${precise(r.leverage)} 倍，对应入场后再跌 ${precise(r.actualDropPct)}% 到估算爆仓价。`;
  }
  if(field('exitMode').value==='target')field('exitPrice').value=String(r.exitPrice);
 }
 function clearResult(){result=null;$('simSave').disabled=true;$('simPrices').innerHTML='<p class="micro">参数已变化，正在重新计算…</p>';$('simMetrics').innerHTML='';$('simRisk').hidden=true;$('simMethod').textContent='';}
 async function calculate(){
  clearTimeout(timer);const ticket=++revision;clearResult();controls();syncEntry();
  if(!field('price').value){$('simPrices').innerHTML='<p class="micro">等待填写参考价格。</p>';message('等待币安报价，或手动填写参考价格。');return;}
  if(field('exitMode').value==='custom'&&!field('exitPrice').value){message('请填写模拟平仓价。',true);return;}
  const dependent=field('leverageMode').value==='risk'?'leverage':'maxDrop';
  if([...form.elements].some(e=>e.name!==dependent&&!e.disabled&&e.checkValidity&&!e.checkValidity())){$('simPrices').innerHTML='<p class="micro">请补全有效参数后查看模拟结果。</p>';message('请检查必填参数和数值范围。',true);return;}
  try{const r=await api('/api/sim/calculate',{inputs:inputs()});if(ticket!==revision)return;render(r);$('simSave').disabled=saving;message('模拟已更新；未保存。');}
  catch(e){if(ticket!==revision)return;$('simPrices').innerHTML='<p class="micro">当前输入无法计算，请修正条件。</p>';$('simMetrics').innerHTML='';$('simRisk').hidden=true;$('simMethod').textContent='';message(e.message,true);}
 }
 function changed(e){
  if(!e.target.name)return;
  if(e.target.name==='entryPrice')field('entryPriceMode').value='manual';
  if(['price','entryDrop'].includes(e.target.name))field('entryPriceMode').value='auto';
  syncEntry();
  if(e.target.name==='leverage')field('leverageMode').value='manual';
  if(e.target.name==='maxDrop')field('leverageMode').value='risk';
  revision++;clearResult();controls();message('参数已变化，正在联动重算…');clearTimeout(timer);timer=setTimeout(calculate,150);
 }
 form.addEventListener('input',changed);form.addEventListener('change',changed);
 async function market(){
  $('simRefresh').disabled=true;
  try{
   const [q,r]=await Promise.all([api('/api/sim/market'),api('/api/sim/reference')]);quote=q;ref=r;
   $('simFeeRates').textContent=`${num(r.maker*100)}% / ${num(r.taker*100)}%`;
   $('simFeeStatus').textContent=`${r.feeLabel}。${r.feeWarning||''}${r.feeMode==='ACCOUNT_API'?'获取于 '+r.feeFetchedAt:'公开参考核对日 '+r.referenceCheckedDate+'；VIP、BNB 抵扣等账户优惠请手动填写。免费站不接入账户私钥，请手动填写账户实际费率。'}`;
   $('simMarginStatus').textContent=r.marginLabel+(r.marginWarning?' · '+r.marginWarning:'');
   if(q.error){$('simLivePrice').textContent='不可用';$('simMarkPrice').textContent='—';$('simFunding').textContent='—';$('simQuoteStatus').textContent=q.error;$('simUsePrice').disabled=true;}
   else{$('simLivePrice').textContent=num(q.price);$('simMarkPrice').textContent=num(q.markPrice);$('simFunding').textContent=precise(q.fundingRate*100)+'%';$('simQuoteStatus').textContent=`来源：币安 USDⓈ-M 官方接口 · ${new Date(q.exchangeTime).toISOString().replace('T',' ').replace('.000Z',' UTC')} · ${q.stale?'时间戳已过期，不自动用于模拟':'价格快照；点击刷新更新'}。`;$('simUsePrice').disabled=q.stale;if(!field('price').value&&!q.stale)field('price').value=q.price;}
   controls();await calculate();
  }catch(e){message(e.message,true);}finally{$('simRefresh').disabled=false;}
 }
 function fill(values){field('entryPriceMode').value=values.entryPriceMode||'auto';for(const e of form.elements)if(e.name&&values[e.name]!==undefined)e.value=values[e.name];controls();syncEntry();}
 async function records(){
  rows=await api('/api/sim/records');$('simRecordCount').textContent=`${rows.length} 条记录 · 当前后台保存 · 与 GitHub 免费站分开`;$('simEmpty').hidden=rows.length>0;
  $('simRecords').innerHTML=[...rows].reverse().map(r=>{const x=r.result;return `<tr><td><strong>第 ${r.period} 期</strong><small class="sim-row-note">${esc(r.createdAt.slice(0,19).replace('T',' '))} UTC</small><small class="sim-row-note">${esc(r.note||'模拟记录')}${r.parentId?' · 承接 '+esc(r.parentId.slice(0,6)):''}</small><small class="sim-row-note">记录 ${esc(r.id.slice(0,6))}${r.parentId&&!rows.some(p=>p.id===r.parentId)?' · 上期已删除，保留本期快照':''}</small></td><td>${num(x.capital)}</td><td>${num(x.entryPrice)}<br><span class="tone-positive">${num(x.takeProfitPrice)}</span></td><td>${num(x.leverage)}×<br><span class="tone-negative">${num(x.liquidationPrice)}</span></td><td>${num(x.entryFee+x.exitFee)}<br>${num(x.fundingCost)}</td><td class="${valueTone(x.netPnL)}">${signedValue(x.netPnL,' U')}<br>${signedValue(x.returnPct)}${x.liquidated?'<br>估算强平 · 保守归零':''}</td><td><strong>${num(x.endingCapital)}</strong></td><td><div class="sim-row-actions"><button type="button" data-sim-action="load" data-id="${r.id}">载入快照</button><button type="button" data-sim-action="next" data-id="${r.id}" ${x.endingCapital<1?'disabled':''}>复利下一期</button><button type="button" class="sim-delete" data-sim-action="delete" data-id="${r.id}">删除</button></div></td></tr>`;}).join('');
 }
 form.onsubmit=async e=>{e.preventDefault();if(saving||!result)return;saving=true;$('simSave').disabled=true;clearTimeout(timer);
  const ticket=revision;
  try{const r=await api('/api/sim/save',{inputs:inputs(),parentId,note:$('simNote').value});if(ticket===revision)render(r.result);await records();message(`第 ${r.period} 期已按提交时参数保存。${ticket===revision?'点击该记录的“复利下一期”继续。':'当前输入已改变，请另行保存。'}`);}catch(ex){message(ex.message,true);}finally{saving=false;$('simSave').disabled=!result;}
 };
 $('simRecords').onclick=async e=>{const b=e.target.closest('[data-sim-action]');if(!b)return;const row=rows.find(r=>r.id===b.dataset.id);if(!row)return;const action=b.dataset.simAction;
  if(action==='delete'){b.disabled=true;try{await api('/api/sim/delete',{id:row.id});lastDeleted=row.id;$('simUndo').hidden=false;await records();message('记录已删除，可撤销。已保存的后续期快照不变。');}catch(ex){message(ex.message,true);b.disabled=false;}return;}
  clearTimeout(timer);revision++;fill(row.inputs);
  if(action==='next'){parentId=row.id;field('capital').value=row.result.endingCapital;$('simNote').value=`第 ${row.period+1} 期 · 承接 ${row.id.slice(0,6)}`;$('simParentNote').textContent=`第 ${row.period+1} 期 · 使用第 ${row.period} 期的期末本金 ${num(row.result.endingCapital)} USDT。请更新本期价格与条件。`;controls();await calculate();}
  else{parentId=row.parentId;$('simNote').value=row.note;$('simParentNote').textContent=`已载入第 ${row.period} 期保存快照；修改后再次保存会新建记录。`;controls();render(row.result);$('simSave').disabled=true;message('正在查看保存时的计算快照。修改条件或重新计算后可保存新记录。');}
  $('simView').scrollIntoView({behavior:'smooth',block:'start'});
 };
 $('simUndo').onclick=async()=>{if(!lastDeleted)return;try{await api('/api/sim/restore',{id:lastDeleted});lastDeleted=null;$('simUndo').hidden=true;await records();message('已恢复记录。');}catch(e){message(e.message,true);}};
 $('simNew').onclick=()=>{parentId=null;field('capital').readOnly=false;$('simNote').value='';$('simParentNote').textContent='新建第一期 · 独立模拟';calculate();};
 $('simUsePrice').onclick=()=>{if(quote?.price&&!quote.stale){field('price').value=quote.price;field('entryPriceMode').value='auto';calculate();}};
 $('simCalculate').onclick=calculate;$('simRefresh').onclick=market;$('simReloadRecords').onclick=()=>records().catch(e=>message(e.message,true));
 $('simExport').onclick=async()=>{try{await records();const blob=new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BTCUSDT-逐期模拟记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){message(e.message,true);}};
 async function init(){if(loaded)return;loaded=true;try{await Promise.all([market(),records()]);}catch(e){message(e.message,true);loaded=false;}}
 $('tab-sim').addEventListener('click',init);$('tab-sim').addEventListener('focus',init);
 if(location.hash==='#sim'){studioTab('sim');init();}
})();
