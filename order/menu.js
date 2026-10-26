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

  const DR = [["hkcoffee","港式咖啡","HK Coffee","36XMDNG54OZT4SK3HSW4L73F"],["milktea","奶茶","Milk Tea","IPPJRU7SJIKBGVEDYJPFX5OO"],["yuanyang","鴛鴦","Yuanyang","PB73YFQYJB7KZCUAIHGMVZZO"],["lemontea","檸茶","Lemon Tea","PZXKQA4LQGCP54TDM7J64OWG"],["lemonwater","檸水","Lemon Water","G2TDHDZZJFIVUYDLTBXWQHSP"],["ovaltine","華田","Ovaltine","GDFTSLM2RHISAL2HUV56YK3T"],["choc","朱古力","Chocolate","DDUB7NZIZ2F7EB7JIZFVIXVS"]];
  function isIced(sel) { const d = ((sel.setdrink || sel.drink || [])[0]) || ""; return d.indexOf("iced_") === 0 || sel.__iced === true; }
  const TASTE = [["lessice","少冰","Less ice",isIced],["moremilk","多奶","More milk"],["lessmilk","少奶","Less milk"],["nomilk","齋","No milk"],["condensed","走","Condensed milk"]];
  const G = {
    noodle: { id:"noodle", zh:"麵類", en:"Noodles", min:1, max:1, station:"kitchen", choices:[["instant","公仔麵","Instant noodles"],["macaroni","通心粉","Macaroni"],["rice","米粉","Rice noodles"],["spag","意粉","Spaghetti"]].map(c=>({id:c[0],zh:c[1],en:c[2],p:0})) },
    sides: { id:"sides", zh:"跟配（揀 2 款）", en:"Sides (pick 2)", min:2, max:2, station:"kitchen", choices:[["sausage","腸仔","Sausage"],["luncheon","午餐肉","Luncheon meat"],["fried","煎蛋","Fried egg"],["overhard","熟蛋","Over-hard egg"],["overeasy","反蛋","Over-easy egg"],["scrambled","炒蛋","Scrambled egg"]].map(c=>({id:c[0],zh:c[1],en:c[2],p:0})) },
    toast: { id:"toast", zh:"加配多士", en:"Add toast", min:0, max:1, station:"kitchen", choices:[{id:"toast",zh:"多士",en:"Toast",p:50,sq:"ILFCGIYLXNIT3UMHFUCFFK5M"}] },
    setdrink: { id:"setdrink", zh:"跟餐飲品", en:"Set drink", min:1, max:1, station:"bar", choices: DR.map(d=>({id:"hot_"+d[0],zh:"熱"+d[1],en:"Hot "+d[2],p:0})).concat(DR.map(d=>({id:"iced_"+d[0],zh:"凍"+d[1],en:"Iced "+d[2],p:50,sq:d[3]}))) },
    taste: { id:"taste", zh:"口味", en:"Preferences", min:0, max:3, station:"bar", choices: TASTE.map(t=>({id:t[0],zh:t[1],en:t[2],p:0,show:t[3]})) },
    toastsw: { id:"toastsw", zh:"烘底", en:"Bread", min:1, max:1, station:"kitchen", choices:[{id:"plain",zh:"不烘底",en:"Plain",p:0},{id:"toasted",zh:"烘底",en:"Toasted",p:50,variant:true}] },
    hot: { id:"drink", zh:"揀飲品", en:"Choose a drink", min:1, max:1, station:"bar", choices: DR.map(d=>({id:"hot_"+d[0],zh:"熱"+d[1],en:"Hot "+d[2],p:0})) },
    iced: { id:"drink", zh:"揀飲品", en:"Choose a drink", min:1, max:1, station:"bar", choices: DR.map(d=>({id:"iced_"+d[0],zh:"凍"+d[1],en:"Iced "+d[2],p:0})) }
  };
  const CATS = [{id:"allday",zh:"全日早餐",en:"All Day Set"},{id:"bakery",zh:"麵包類",en:"Bakery"},{id:"sandwich",zh:"三文治",en:"Sandwiches & Toast"},{id:"drinks",zh:"飲品",en:"Drinks"}];
  const SETG = ["noodle","sides","toast","setdrink","taste"];
  const SETD = { zh:"麵 + 2 款跟配 + 飲品", en:"Noodles + 2 sides + drink" };
  /* sq = Square item variation ID (price source). sqT = toasted variation. */
  const MENU = [
    {id:"ad_satay",cat:"allday",zh:"沙爹牛肉",en:"Satay Beef",p:950,g:SETG,nut:true,d:SETD,sq:"7V37O4E4IY4LA2ECWWFH7TNK"},
    {id:"ad_ham",cat:"allday",zh:"火腿",en:"Ham",p:950,g:SETG,d:SETD,sq:"QDJEZHOELC2PMZUK76JMEEHY"},
    {id:"ad_fivespice",cat:"allday",zh:"五香肉丁",en:"Five Spice Pork",p:950,g:SETG,d:SETD,sq:"SATHJILD7JVSQS6SHWSRZIH7"},
    {id:"ad_bbq",cat:"allday",zh:"叉燒",en:"BBQ Pork",p:950,g:SETG,d:SETD,sq:"AFENZLCEBW5MWUDSWQRLTYP3"},
    {id:"bk_pineapple",cat:"bakery",zh:"菠蘿包",en:"Pineapple Bun",p:200,g:[],stock:"pineapple",sq:"7NNL45ZAAOKDWPDQT4YQ54S6"},
    {id:"bk_pinebutter",cat:"bakery",zh:"菠蘿油",en:"Pineapple Bun with Butter",p:250,g:[],stock:"pineapple",sq:"3XZTUOEPT6S4ZWF4SQE7GK33"},
    {id:"bk_cocktail",cat:"bakery",zh:"雞尾包",en:"Cocktail Bun",p:200,g:[],stock:"cocktail",sq:"O5724WXR43AJEICC3GRV47FM"},
    {id:"bk_sausage",cat:"bakery",zh:"腸仔包",en:"Sausage Bun",p:200,g:[],stock:"sausage",sq:"APA66WBGY2RE5VFCEBI3HDDH"},
    {id:"bk_eggtart",cat:"bakery",zh:"蛋撻",en:"Egg Tart",p:150,g:[],stock:"eggtart",sq:"J3TYDHIXIDMOT6YDKAY5AER7"},
    {id:"sw_egg",cat:"sandwich",zh:"雞蛋三文治",en:"Egg Sandwich",p:450,g:["toastsw"],sq:"C6ZBURYOIUFSCHV25IVZWQGT",sqT:"3GPYIF72XVPACH7RBHXG47MW"},
    {id:"sw_hamegg",cat:"sandwich",zh:"火腿雞蛋三文治",en:"Ham & Egg Sandwich",p:450,g:["toastsw"],sq:"J5HOY5NLGH6UQZEYTH3GRKFV",sqT:"2RVLI6YJ5BXE3DFOK6ENWKTL"},
    {id:"sw_luncheon",cat:"sandwich",zh:"午餐肉雞蛋三文治",en:"Luncheon Meat & Egg Sandwich",p:450,g:["toastsw"],sq:"BPIFBIISM4X6TI7QRYDRROYD",sqT:"JZST2O6NDJK6VRZGAXEWCPML"},
    {id:"sw_corned",cat:"sandwich",zh:"咸牛肉雞蛋三文治",en:"Corned Beef & Egg Sandwich",p:450,g:["toastsw"],sq:"ROCEK7LLXTBK3DK73KXNPZ33",sqT:"V6KF5Y5ODAYQQVUBJNHMGNWN"},
    {id:"sw_satay",cat:"sandwich",zh:"沙嗲牛肉雞蛋三文治",en:"Satay Beef & Egg Sandwich",p:500,g:["toastsw"],nut:true,sq:"SGNWPXOPJ2CIOVF4T6XQ6GK3",sqT:"6ICMR7DI25MNBGMIAVG7UGXD"},
    {id:"sw_french",cat:"sandwich",zh:"西多士",en:"French Toast",p:400,g:[],sq:"SHTBGLKBOES3R37D2X2WTGPL"},
    {id:"sw_pbtoast",cat:"sandwich",zh:"煉奶花生醬多士",en:"Condensed Milk & Peanut Butter Toast",p:250,g:[],nut:true,sq:"RVGRIURSNKV5HIUHHGUGXZ5J"},
    {id:"sw_buttertoast",cat:"sandwich",zh:"煉奶牛油多士",en:"Condensed Milk & Butter Toast",p:250,g:[],sq:"O4KARRK4BEMTRLXXWQEJFAEV"},
    {id:"dk_hot",cat:"drinks",zh:"熱飲",en:"Hot Drinks",p:300,g:["hot","taste"],sq:"6I7EQTH6N3FUY72DKSFVLZNB"},
    {id:"dk_iced",cat:"drinks",zh:"凍飲",en:"Iced Drinks",p:350,g:["iced","taste"],iced:true,sq:"XH75P5J5Q5G3WMS6UGORQQBQ"}
  ];
  const STOCK = [{k:"pineapple",zh:"菠蘿包",en:"Pineapple Bun",nzh:"菠蘿油都扣呢個數",nen:"Pineapple Bun with Butter uses this count too"},{k:"cocktail",zh:"雞尾包",en:"Cocktail Bun"},{k:"sausage",zh:"腸仔包",en:"Sausage Bun"},{k:"eggtart",zh:"蛋撻",en:"Egg Tart"}];
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
    (it.g || []).forEach(k => { const g = G[k]; (sel[g.id] || []).forEach(cid => { const c = g.choices.find(x => x.id === cid); if (c) { const cp = choicePrice(g.id, c, P); unit += cp; desc.push({g:g.id, st:g.station, zh:c.zh, en:c.en, p:cp}); } }); });
    return { itemId, qty, sel, unit, desc };
  }
  function cleanSel(it, sel) {           /* keep only valid choice ids, enforce min/max */
    const out = {};
    for (const k of (it.g || [])) { const g = G[k]; const v = (sel[g.id] || []).filter(cid => g.choices.some(c => c.id === cid)).slice(0, g.max); if (v.length < g.min) return null; if (v.length) out[g.id] = v; }
    return out;
  }
  function dayKey(d) {                   /* London calendar day, e.g. 2026-10-30 */
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year:"numeric", month:"2-digit", day:"2-digit" }).format(d || new Date());
  }
  window.YO = { FIREBASE, DR, TASTE, G, CATS, MENU, STOCK, TABLES, byId, isIced, itemPrice, choicePrice, itemName, mkLine, cleanSel, dayKey };
})();
