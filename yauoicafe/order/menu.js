/* 友愛冰室 QR 落單 — shared menu + Firebase config.
   Names, options and stations live here. PRICES come from Square: a GitHub Action
   (scripts/sync-square-prices.mjs) writes them to /ordering/public/prices.
   The `p` values below are only a fallback for before the first sync. */
(function () {
  "use strict";
  const FIREBASE = {
    apiKey: "AIzaSyBCCnoKm-ypR-3MfzwTRXLd1TTplcqteY8",
    authDomain: "yauoicafequeue.firebaseapp.com",
    databaseURL: "https://yauoicafequeue-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "yauoicafequeue",
    storageBucket: "yauoicafequeue.firebasestorage.app",
    messagingSenderId: "354774084334",
    appId: "1:354774084334:web:9c8923bd9ece01b45f61ff"
  };

  /* UK 14 allergens. Every listed allergen is shown as "contains" (owner's decision 2026-10-27:
     items previously marked "may contain" are now declared as "contains"). */
  const AL = {G:["麩質","Gluten"],Cr:["甲殼類","Crustaceans"],E:["雞蛋","Egg"],F:["魚","Fish"],P:["花生","Peanut"],So:["大豆","Soya"],M:["奶","Milk"],N:["木本堅果","Tree nuts"],Ce:["西芹","Celery"],Mu:["芥末","Mustard"],Se:["芝麻","Sesame"],Su:["亞硫酸鹽","Sulphites"],Lu:["羽扇豆","Lupin"],Mo:["軟體動物","Molluscs"]};
  const AL_ORDER = ["P","N","Cr","Mo","F","E","M","G","So","Se","Su","Ce","Mu","Lu"];
  const DRAL = {hkcoffee:["M"],milktea:["M"],yuanyang:["M"],lemontea:[],lemonwater:[],ovaltine:["M","G","So"],choc:["M","So","N"]};
  const DR = [["hkcoffee","港式咖啡","HK Coffee","36XMDNG54OZT4SK3HSW4L73F"],["milktea","奶茶","Milk Tea","IPPJRU7SJIKBGVEDYJPFX5OO"],["yuanyang","鴛鴦","Yuanyang","PB73YFQYJB7KZCUAIHGMVZZO"],["lemontea","檸茶","Lemon Tea","PZXKQA4LQGCP54TDM7J64OWG"],["lemonwater","檸水","Lemon Water","G2TDHDZZJFIVUYDLTBXWQHSP"],["ovaltine","華田","Ovaltine","GDFTSLM2RHISAL2HUV56YK3T"],["choc","朱古力","Chocolate","DDUB7NZIZ2F7EB7JIZFVIXVS"]];
  function isIced(sel) { const d = ((sel.setdrink || sel.drink || [])[0]) || ""; return d.indexOf("iced_") === 0 || sel.__iced === true; }
  const TASTE = [["lessice","少冰","Less ice",isIced,[]],["moremilk","多奶","More milk",null,["M"]],["lessmilk","少奶","Less milk",null,["M"]],["nomilk","齋","No milk",null,[]],["condensed","走","Condensed milk",null,["M"]]];
  const G = {
    noodle: { id:"noodle", zh:"麵類", en:"Noodles", min:1, max:1, station:"kitchen", choices:[["instant","公仔麵","Instant noodles"],["macaroni","通心粉","Macaroni"],["rice","米粉","Rice noodles"],["spag","意粉","Spaghetti"]].map(c=>({id:c[0],zh:c[1],en:c[2],p:0,al:["G"]})) },
    sides: { id:"sides", zh:"跟配（揀 2 款）", en:"Sides (pick 2)", min:2, max:2, station:"kitchen", choices:[["sausage","腸仔","Sausage",["G","So"]],["luncheon","午餐肉","Luncheon meat",["G","So"]],["fried","煎蛋","Fried egg",["E"]],["overhard","熟蛋","Over-hard egg",["E"]],["overeasy","反蛋","Over-easy egg",["E"]],["scrambled","炒蛋","Scrambled egg (with evaporated milk)",["E","M"],2]].map(c=>({id:c[0],zh:c[1],en:c[2],p:0,al:c[3],w:c[4]||1})),
      dup:true,   /* tap the same side twice = double (e.g. two sausages) */
      note:{zh:"同一款撳兩下＝雙份（例如兩條腸仔）。炒蛋用兩隻蛋炒，份量等於兩款跟配，所以揀炒蛋就唔可以再配其他跟配。",en:"Tap a side twice for a double (e.g. two sausages). Our scrambled egg is made with two eggs, so it counts as both sides and can't be paired with another side."} },
    toast: { id:"toast", zh:"加配多士", en:"Add toast", min:0, max:1, station:"bar",   /* toast is made at the drinks bar */ choices:[{id:"toast",zh:"牛油多士",en:"Buttered toast",p:50,sq:"ILFCGIYLXNIT3UMHFUCFFK5M",al:["G","M"]}] },
    setdrink: { id:"setdrink", zh:"跟餐飲品", en:"Set drink", min:1, max:1, station:"bar", choices: DR.map(d=>({id:"hot_"+d[0],zh:"熱"+d[1],en:"Hot "+d[2],p:0,al:DRAL[d[0]]})).concat(DR.map(d=>({id:"iced_"+d[0],zh:"凍"+d[1],en:"Iced "+d[2],p:50,sq:d[3],al:DRAL[d[0]]}))) },
    taste: { id:"taste", zh:"口味", en:"Preferences", min:0, max:3, station:"bar", choices: TASTE.map(t=>({id:t[0],zh:t[1],en:t[2],p:0,show:t[3]||undefined,al:t[4]})) },
    toastsw: { id:"toastsw", zh:"烘底", en:"Bread", min:1, max:1, station:"kitchen", choices:[{id:"plain",zh:"不烘底",en:"Plain",p:0},{id:"toasted",zh:"烘底",en:"Toasted",p:50,variant:true}] },
    hot: { id:"drink", zh:"揀飲品", en:"Choose a drink", min:1, max:1, station:"bar", choices: DR.map(d=>({id:"hot_"+d[0],zh:"熱"+d[1],en:"Hot "+d[2],p:0,al:DRAL[d[0]]})) },
    iced: { id:"drink", zh:"揀飲品", en:"Choose a drink", min:1, max:1, station:"bar", choices: DR.map(d=>({id:"iced_"+d[0],zh:"凍"+d[1],en:"Iced "+d[2],p:0,al:DRAL[d[0]]})) }
  };
  const CATS = [{id:"allday",zh:"全日早餐",en:"All Day Set"},{id:"bakery",zh:"麵包類",en:"Bakery"},{id:"sandwich",zh:"三文治",en:"Sandwiches & Toast"},{id:"drinks",zh:"飲品",en:"Drinks"}];
  const SETG = ["noodle","sides","toast","setdrink","taste"];
  const SETD = { zh:"麵 + 2 款跟配 + 飲品", en:"Noodles + 2 sides + drink" };
  /* sq = Square item variation ID (price source). sqT = toasted variation. st:"bar" = slip goes to the drinks bar (toast).
     img:1 = photo at /yauoicafe/assets/menu/<id>.webp (real café photos, background removed, 480×480). */
  const MENU = [
    {id:"ad_satay",img:1,imgCap:{zh:"相片：沙嗲牛肉公仔麵，麵款可以自選",en:"Photo: satay beef with instant noodles — choose your noodles"},al:["P","So","Se","Cr","G"],cat:"allday",zh:"沙嗲牛肉",en:"Satay Beef",p:950,g:SETG,d:SETD,sq:"7V37O4E4IY4LA2ECWWFH7TNK"},
    {id:"ad_ham",img:1,imgCap:{zh:"相片：火腿通心粉，麵款可以自選",en:"Photo: ham with macaroni — choose your noodles"},al:["G","Su"],cat:"allday",zh:"火腿",en:"Ham",p:950,g:SETG,d:SETD,sq:"QDJEZHOELC2PMZUK76JMEEHY"},
    {id:"ad_fivespice",img:1,imgCap:{zh:"相片：五香肉丁米粉，麵款可以自選",en:"Photo: five spice pork with rice noodles — choose your noodles"},al:["So","G"],cat:"allday",zh:"五香肉丁",en:"Five Spice Pork",p:950,g:SETG,d:SETD,sq:"SATHJILD7JVSQS6SHWSRZIH7"},
    {id:"ad_bbq",img:1,imgCap:{zh:"相片：叉燒意粉，麵款可以自選",en:"Photo: BBQ pork with spaghetti — choose your noodles"},al:["G","So"],cat:"allday",zh:"叉燒",en:"BBQ Pork",p:950,g:SETG,d:SETD,sq:"AFENZLCEBW5MWUDSWQRLTYP3"},
    {id:"bk_pineapple",img:1,al:["G","E","M"],cat:"bakery",zh:"菠蘿包",en:"Pineapple Bun",p:200,g:[],stock:"pineapple",sq:"7NNL45ZAAOKDWPDQT4YQ54S6"},
    {id:"bk_pinebutter",img:1,st:"bar",al:["G","E","M"],cat:"bakery",zh:"菠蘿油",en:"Pineapple Bun with Butter",p:250,g:[],stock:"pineapple",sq:"3XZTUOEPT6S4ZWF4SQE7GK33"},
    {id:"bk_cocktail",img:1,al:["G","E","M"],cat:"bakery",zh:"雞尾包",en:"Cocktail Bun",p:200,g:[],stock:"cocktail",sq:"O5724WXR43AJEICC3GRV47FM"},
    {id:"bk_sausage",img:1,al:["G","So","Su"],cat:"bakery",zh:"腸仔包",en:"Sausage Bun",p:200,g:[],stock:"sausage",sq:"APA66WBGY2RE5VFCEBI3HDDH"},
    {id:"bk_eggtart",img:1,al:["G","E","M"],cat:"bakery",zh:"蛋撻",en:"Egg Tart",p:150,g:[],stock:"eggtart",sq:"J3TYDHIXIDMOT6YDKAY5AER7"},
    {id:"bk_snowcharsiu",img:1,al:["G","E","M","So"],cat:"bakery",zh:"雪山叉燒包",en:"Snow-top BBQ Pork Bun",p:300,g:[],stock:"snowcharsiu"},
    /* 是日特別麵包 ×5 slots: name, price and allergens set daily by staff in ordering/public/special, special2 … special5 (see applySpecial) */
    {id:"bk_special",special:1,al:[],cat:"bakery",zh:"是日特別麵包",en:"Today's Special Bun",p:200,g:[],stock:"special"},
    {id:"bk_special2",special:2,al:[],cat:"bakery",zh:"是日特別麵包 2",en:"Today's Special Bun 2",p:200,g:[],stock:"special2"},
    {id:"bk_special3",special:3,al:[],cat:"bakery",zh:"是日特別麵包 3",en:"Today's Special Bun 3",p:200,g:[],stock:"special3"},
    {id:"bk_special4",special:4,al:[],cat:"bakery",zh:"是日特別麵包 4",en:"Today's Special Bun 4",p:200,g:[],stock:"special4"},
    {id:"bk_special5",special:5,al:[],cat:"bakery",zh:"是日特別麵包 5",en:"Today's Special Bun 5",p:200,g:[],stock:"special5"},
    {id:"sw_egg",img:1,al:["E","M","G"],cat:"sandwich",zh:"雞蛋三文治",en:"Egg Sandwich",p:450,g:["toastsw"],sq:"C6ZBURYOIUFSCHV25IVZWQGT",sqT:"3GPYIF72XVPACH7RBHXG47MW"},
    {id:"sw_hamegg",img:1,al:["E","M","G","Su"],cat:"sandwich",zh:"火腿雞蛋三文治",en:"Ham & Egg Sandwich",p:450,g:["toastsw"],sq:"J5HOY5NLGH6UQZEYTH3GRKFV",sqT:"2RVLI6YJ5BXE3DFOK6ENWKTL"},
    {id:"sw_luncheon",img:1,al:["E","M","G","So"],cat:"sandwich",zh:"午餐肉雞蛋三文治",en:"Luncheon Meat & Egg Sandwich",p:450,g:["toastsw"],sq:"BPIFBIISM4X6TI7QRYDRROYD",sqT:"JZST2O6NDJK6VRZGAXEWCPML"},
    {id:"sw_corned",img:1,al:["E","M","Su","G"],cat:"sandwich",zh:"咸牛肉雞蛋三文治",en:"Corned Beef & Egg Sandwich",p:450,g:["toastsw"],sq:"ROCEK7LLXTBK3DK73KXNPZ33",sqT:"V6KF5Y5ODAYQQVUBJNHMGNWN"},
    {id:"sw_satay",img:1,al:["E","M","P","So","Se","Cr","G"],cat:"sandwich",zh:"沙嗲牛肉雞蛋三文治",en:"Satay Beef & Egg Sandwich",p:500,g:["toastsw"],sq:"SGNWPXOPJ2CIOVF4T6XQ6GK3",sqT:"6ICMR7DI25MNBGMIAVG7UGXD"},
    {id:"sw_french",img:1,st:"bar",al:["E","M","P","G"],cat:"sandwich",zh:"西多士",en:"French Toast",p:400,g:[],sq:"SHTBGLKBOES3R37D2X2WTGPL"},
    /* 開心果醬西多士: allergens confirmed by Manson 2026-11-09 (開心果、果仁、花生、穀物、朱古力、煉奶、牛油; egg in batter; chocolate sauce has soya). Not on Square yet: price from p. */
    {id:"sw_pistachio",img:1,st:"bar",al:["P","N","E","M","G","So"],cat:"sandwich",zh:"開心果醬西多士",en:"Pistachio French Toast",p:500,g:[]},
    {id:"sw_pbtoast",st:"bar",al:["P","M","G"],cat:"sandwich",zh:"煉奶花生醬多士",en:"Condensed Milk & Peanut Butter Toast",p:250,g:[],sq:"RVGRIURSNKV5HIUHHGUGXZ5J"},
    {id:"sw_buttertoast",st:"bar",al:["M","G"],cat:"sandwich",zh:"煉奶牛油多士",en:"Condensed Milk & Butter Toast",p:250,g:[],sq:"O4KARRK4BEMTRLXXWQEJFAEV"},
    {id:"dk_hot",al:[],cat:"drinks",zh:"熱飲",en:"Hot Drinks",p:300,g:["hot","taste"],sq:"6I7EQTH6N3FUY72DKSFVLZNB"},
    {id:"dk_iced",al:[],cat:"drinks",zh:"凍飲",en:"Iced Drinks",p:350,g:["iced","taste"],iced:true,sq:"XH75P5J5Q5G3WMS6UGORQQBQ"}
  ];
  const STOCK = [{k:"pineapple",zh:"菠蘿包",en:"Pineapple Bun",nzh:"菠蘿油都扣呢個數",nen:"Pineapple Bun with Butter uses this count too"},{k:"cocktail",zh:"雞尾包",en:"Cocktail Bun"},{k:"sausage",zh:"腸仔包",en:"Sausage Bun"},{k:"eggtart",zh:"蛋撻",en:"Egg Tart"},{k:"snowcharsiu",zh:"雪山叉燒包",en:"Snow-top BBQ Pork Bun"},{k:"special",zh:"是日特別麵包",en:"Today's Special Bun",special:1},{k:"special2",zh:"是日特別麵包 2",en:"Today's Special Bun 2",special:2},{k:"special3",zh:"是日特別麵包 3",en:"Today's Special Bun 3",special:3},{k:"special4",zh:"是日特別麵包 4",en:"Today's Special Bun 4",special:4},{k:"special5",zh:"是日特別麵包 5",en:"Today's Special Bun 5",special:5}];
  const TABLES = ["T1","T2","T3","T4","T5","T6","T7","T8","T9"];
  const byId = {}; MENU.forEach(m => { byId[m.id] = m; });

  /* P = /ordering/public (prices, names, off, stock, next). Safe with P = {}. */
  function itemPrice(it, P, toasted) {
    const pr = (P && P.prices && P.prices.items) || {};
    if (toasted && it.sqT && pr[it.id + ":toasted"] != null) return pr[it.id + ":toasted"];
    if (pr[it.id] != null) return pr[it.id] + (toasted && !it.sqT ? 50 : 0);
    return it.p + (toasted ? 50 : 0);
  }
  function choicePrice(gid, c, P) {
    const mods = (P && P.prices && P.prices.mods) || {};
    if (c.variant) return 0;               /* toasted priced via variation */
    const key = gid + ":" + c.id;
    return mods[key] != null ? mods[key] : c.p;
  }
  function itemName(it, P, lang) {
    const n = P && P.names && P.names[it.id];
    if (n && n[lang]) return n[lang];
    return lang === "en" ? it.en : it.zh;
  }
  /* Build a priced line from ids only — staff side always re-prices from P, never trusts client prices. */
  function mkLine(itemId, qty, sel, P) {
    const it = byId[itemId]; if (!it) return null;
    const toasted = (sel.toastsw || [])[0] === "toasted";
    let unit = itemPrice(it, P, toasted); const desc = [];
    (it.g || []).forEach(k => { const g = G[k]; const n = {}; (sel[g.id] || []).forEach(cid => { n[cid] = (n[cid] || 0) + 1; });
      Object.keys(n).forEach(cid => { const c = g.choices.find(x => x.id === cid); if (c) { const cp = choicePrice(g.id, c, P) * n[cid]; unit += cp;
        desc.push({g:g.id, st:g.station, zh:c.zh + (n[cid] > 1 ? " ×" + n[cid] : ""), en:c.en + (n[cid] > 1 ? " ×" + n[cid] : ""), p:cp}); } }); });
    return { itemId, qty, sel, unit, desc };
  }
  /* how many slots a selection uses: a choice with w:2 (scrambled egg) fills both sides */
  function selCount(g, ids) { return (ids || []).reduce((a, cid) => { const c = g.choices.find(x => x.id === cid); return a + (c ? (c.w || 1) : 0); }, 0); }
  function cleanSel(it, sel) {           /* keep only valid choice ids, enforce min/max (weighted) */
    const out = {};
    for (const k of (it.g || [])) { const g = G[k]; const v = [];
      (sel[g.id] || []).filter(cid => g.choices.some(c => c.id === cid)).forEach(cid => {
        if (v.indexOf(cid) >= 0 && !g.dup) return;                       /* doubles only where allowed */
        if (selCount(g, v.concat(cid)) <= g.max) v.push(cid); });
      if (selCount(g, v) < g.min) return null; if (v.length) out[g.id] = v; }
    return out;
  }
  function sortAl(list) { const u = []; list.forEach(a => { if (AL[a] && u.indexOf(a) < 0) u.push(a); }); return u.sort((a, b) => AL_ORDER.indexOf(a) - AL_ORDER.indexOf(b)); }
  /* allergens for an item + the options actually chosen */
  function lineAllergens(itemId, sel) {
    const it = byId[itemId]; if (!it) return [];
    let out = (it.al || []).slice();
    (it.g || []).forEach(k => { const g = G[k]; (sel[g.id] || []).forEach(cid => { const c = g.choices.find(x => x.id === cid); if (c && c.al) out = out.concat(c.al); }); });
    return sortAl(out);
  }
  /* does any option of this item add allergens beyond the base? */
  function optionsAddAllergens(it) { return (it.g || []).some(k => G[k].choices.some(c => (c.al || []).some(a => (it.al || []).indexOf(a) < 0))); }
  function alName(code, lang) { return AL[code] ? AL[code][lang === "en" ? 1 : 0] : code; }
  /* Today's special bun: copy staff's settings (P.special = {zh,en,p,al:[codes],none:true}) onto the menu item.
     Call every time P loads. Not set up (no name, or allergens not confirmed) = hidden and not orderable. */
  /* slot n: P key / item id / stock key = "special"+suffix, suffix "" for slot 1 (kept for old data), "2".."5" */
  const SP_SLOTS = [1, 2, 3, 4, 5], spSuf = n => n === 1 ? "" : String(n);
  function applySpecial(P) {
    let any = false;
    SP_SLOTS.forEach(n => {
      const suf = spSuf(n), s = (P && P["special" + suf]) || {}, it = byId["bk_special" + suf], st = STOCK.find(x => x.k === "special" + suf);
      const al = Object.values(s.al || {}).filter(a => AL[a]);
      const ok = !!(s.zh && (s.none || al.length) && s.p > 0);
      const d0 = "是日特別麵包" + (n > 1 ? " " + n : ""), e0 = "Today's Special Bun" + (n > 1 ? " " + n : "");
      it.zh = ok ? s.zh : d0; it.en = ok ? (s.en || s.zh) : e0; it.p = ok ? s.p : 200;
      it.al = ok && !s.none ? sortAl(al) : [];
      it.ready = ok; st.zh = it.zh; st.en = it.en; if (ok) any = true;
    });
    return any;
  }
  /* hidden from customers: special bun not set up today */
  function hiddenItem(it) { return !!(it && it.special && !it.ready); }
  function dayKey(d) {                   /* London calendar day, e.g. 2026-10-30 */
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year:"numeric", month:"2-digit", day:"2-digit" }).format(d || new Date());
  }
  window.YO = { FIREBASE, DR, TASTE, G, CATS, MENU, STOCK, TABLES, byId, isIced, itemPrice, choicePrice, itemName, mkLine, cleanSel, selCount, dayKey, AL, sortAl, lineAllergens, optionsAddAllergens, alName, applySpecial, hiddenItem, SP_SLOTS, spSuf };
})();
