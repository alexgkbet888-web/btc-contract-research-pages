/* Browser-only scenario calculator. Never sends orders or account credentials. */
function calculateScenario(b) {
 const number=(key,lo,hi)=>{const v=Number(b[key]);if(b[key]===null||b[key]===''||!Number.isFinite(v)||v<lo||v>hi)throw Error(`${key} 必须在 ${lo} 至 ${hi} 之间`);return v;};
 const choice=(key,options,fallback)=>{const v=b[key]??fallback;if(!options.includes(v))throw Error(`无效 ${key}`);return v;};
 const linked=b.linkRisk===true,manualLinked=linked&&(b.leverageMode??'manual')==='manual';
 const capital=number('capital',1,1e8),price=number('price',.01,1e7),tp=number('takeProfit',.01,1000)/100;
 let tolerance=number('maxDrop',manualLinked?0:.1,linked?100:99.9)/100;
 const funding=number('fundingCost',-capital/2,capital/2),mmr=number('mmr',.001,20)/100;
 const mode=choice('leverageMode',['manual','risk'],'manual'),feeMode=choice('feeMode',['auto','manual'],'auto');
 const entryRole=choice('entryRole',['maker','taker'],'taker'),exitRole=choice('exitRole',['maker','taker'],'taker');
 const rates={maker:.0002,taker:.0005},ef=feeMode==='auto'?rates[entryRole]:number('entryFee',0,2)/100,xf=feeMode==='auto'?rates[exitRole]:number('exitFee',0,2)/100;
 const entryPriceMode=choice('entryPriceMode',['auto','manual'],'auto');
 const entry=entryPriceMode==='manual'?number('entryPrice',.01,1e7):price*(1-number('entryDrop',0,99)/100),entryDropPct=(1-entry/price)*100;let target=entry*(1-tolerance),quantity,notional,leverage;
 if(mode==='risk'){
  quantity=(capital-funding)/(entry*(tolerance+ef+(1-tolerance)*mmr));notional=quantity*entry;
  const margin=capital-notional*ef;if(margin<=0)throw Error('手续费超过可用本金');leverage=notional/margin;
  if(leverage<1-1e-10||leverage>125+1e-10)throw Error('目标风险对应杠杆超出 1–125 倍，请调整风险距离');leverage=Math.min(125,Math.max(1,leverage));
 }else{leverage=number('leverage',1,125);notional=capital*leverage/(1+leverage*ef);quantity=notional/entry;}
 const openFee=notional*ef,wallet=capital-openFee-funding,liquidation=Math.max(0,(notional-wallet)/(quantity*(1-mmr)));
 if(liquidation>=entry)throw Error('开仓后已不足维持保证金，请降低杠杆或成本');
 if(manualLinked){tolerance=1-liquidation/entry;target=liquidation;}
 const takePrice=entry*(1+tp),exitMode=choice('exitMode',['target','custom'],'target'),exitPrice=exitMode==='target'?takePrice:number('exitPrice',.01,1e7);
 const liquidated=exitPrice<=liquidation,closeFee=liquidated?0:quantity*exitPrice*xf,gross=quantity*(exitPrice-entry),ending=liquidated?0:Math.max(0,capital+gross-openFee-closeFee-funding);
 return {entryPriceMode,entryDropPct,linkRisk:linked,capital,referencePrice:price,entryPrice:entry,takeProfitPrice:takePrice,liquidationPrice:liquidation,targetRiskPrice:target,actualDropPct:(1-liquidation/entry)*100,maxDropPct:tolerance*100,riskWithinTolerance:liquidation<=target+1e-7,leverage,notional,quantity,initialMargin:notional/leverage,entryFee:openFee,exitFee:closeFee,entryFeeRate:ef,exitFeeRate:xf,fundingCost:funding,exitPrice,grossPnL:liquidated?null:gross,netPnL:ending-capital,returnPct:(ending/capital-1)*100,endingCapital:ending,liquidated,feeLabel:feeMode==='auto'?'普通用户公开参考费率（非账户自动获取）':'手动费率',marginLabel:'手动维持保证金率 · 简化估算',calculatedAt:new Date().toISOString(),assumptions:'仅 USDT 抵押、BTCUSDT 单一多仓；本金含开仓费预留。标记价触发强平；未模拟滑点、数量步进、多资产、其他仓位、清算费和 ADL。资金费为手动累计假设。触及估算爆仓价的期末资金保守记为 0。'};
}
if(typeof module!=='undefined')module.exports={calculateScenario};
