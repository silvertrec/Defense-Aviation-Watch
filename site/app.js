(function(){
var LINES=["Military MRO","Manpower","Facility management","Aerial firefighting","Drones / UAS","Aerial refueling","SAR","Engineering, training and simulation"];
var SCOPES=["UAE / GCC","Global MRO","Competitors / M&A","Capability themes"];
var PRI=[["high","High"],["med","Medium"],["watch","Watch"]];
var st={pri:"",scope:"",line:"",co:"",items:[],watch:[],brief:null,all:false};
var $=function(i){return document.getElementById(i)};
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function fmt(d){try{var x=new Date(d);if(isNaN(x))return d||"";return x.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Dubai"})}catch(e){return d||""}}
function fmtS(d){try{var x=new Date(d+"T00:00:00+04:00");return x.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"Asia/Dubai"})}catch(e){return d||""}}
function fmtT(d){try{var x=new Date(d);if(isNaN(x))return d||"pending";return x.toLocaleString("en-GB",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dubai"})+" GST"}catch(e){return "pending"}}
function today(){return new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Dubai"})}
function dayMs(s){return new Date(s+"T00:00:00+04:00").getTime()}
function live(i){return !i.hold}
function future(i){return (i.date||"")>=today()}
function disputed(i){return i.disputed===true||/disputed|sources differ/i.test((i.source||"")+" "+(i.why||"")+" "+(i.basis||""))}

/* data-link state */
function nextRun(ref){
  var d=new Date(ref.getTime()+4*3600e3),y=d.getUTCFullYear(),m=d.getUTCMonth(),day=d.getUTCDate();
  for(var k=0;k<9;k++){var t=Date.UTC(y,m,day+k,2,59),wd=new Date(t).getUTCDay();if(t>ref.getTime()&&wd>=1&&wd<=5)return t}
  return null}
function renderLink(){
  var b=st.brief,L=$("link"),S=$("linkS"),T=$("linkT");
  L.className="link";
  if(!b||!b.refreshed){S.textContent="awaiting";T.textContent="";return}
  var r=new Date(b.refreshed);if(isNaN(r)){S.textContent="unknown";return}
  var nr=nextRun(r),now=Date.now(),cls="ok",label="nominal";
  if(nr!==null){if(now>nr+27*3600e3){cls="bad";label="stale"}else if(now>nr+3*3600e3){cls="warn";label="delayed"}}
  L.className="link "+cls;S.textContent=label;
}

/* filters */
function chips(host,list,key){
  var all=el("button","chip","All");all.setAttribute("aria-pressed","true");all.type="button";all.dataset.v="";host.appendChild(all);
  var btns=[all];
  list.forEach(function(p){var v=Array.isArray(p)?p[0]:p,l=Array.isArray(p)?p[1]:p;var b=el("button","chip",l);b.type="button";b.dataset.v=v;b.setAttribute("aria-pressed","false");host.appendChild(b);btns.push(b)});
  btns.forEach(function(b){b.addEventListener("click",function(){st[key]=b.dataset.v;btns.forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});renderFeed()})});
}
chips($("fpri"),PRI,"pri");chips($("fscope"),SCOPES,"scope");
LINES.forEach(function(l){var o=el("option",null,l);o.value=l;$("fline").appendChild(o)});
$("fline").addEventListener("change",function(){st.line=this.value;renderFeed()});
$("fco").addEventListener("change",function(){st.co=this.value;renderFeed()});

/* situation tiles */
function renderTiles(){
  var h=$("sit");h.textContent="";
  var rows=st.items.filter(live),t=today(),t0=dayMs(t);
  var c={high:0,med:0,watch:0},wk=0,up=0;
  rows.forEach(function(i){
    if(c[i.priority]!=null)c[i.priority]++;
    if(future(i))up++;else{var ago=(t0-dayMs(i.date))/864e5;if(ago>=0&&ago<=7)wk++}
  });
  [["High priority",c.high,"hi"],["Medium priority",c.med,"med"],["Watch",c.watch,"watch"],["New, last 7 days",wk,""],["Upcoming events",up,""]].forEach(function(x){
    var d=el("div","tile "+x[2]);d.appendChild(el("span","n",String(x[1])));d.appendChild(el("span","lbl",x[0]));h.appendChild(d)});
}

/* brief */
function renderBrief(){
  var b=st.brief,h=$("brief");h.textContent="";
  if(!b){h.appendChild(el("div","empty","Awaiting first refresh."));return}
  $("bstamp").textContent="Refreshed "+fmtT(b.refreshed);
  if(b.summary)h.appendChild(el("p","sum",b.summary));
  var dec=(b.decisions&&b.decisions.length)?b.decisions:(b.priorities||[]).map(function(p){return{what:p.now,topic:p.name}});
  dec=dec.filter(function(d){return d&&d.what});
  if(dec.length){
    var sh=el("div","sub-h");sh.appendChild(el("h2",null,"Decisions required this week"));h.appendChild(sh);
    var g=el("div","dec");
    dec.forEach(function(d){var c=el("div","d");
      if(d.topic)c.appendChild(el("span","lbl",d.topic));
      c.appendChild(el("div","what",d.what));
      var kv=el("div","kv");
      if(d.lead){var a=el("span");a.appendChild(document.createTextNode("Suggested lead "));a.appendChild(el("b",null,d.lead));kv.appendChild(a)}
      if(d.by){var z=el("span");z.appendChild(document.createTextNode("By "));z.appendChild(el("b",null,fmtS(d.by)));kv.appendChild(z)}
      if(kv.childNodes.length)c.appendChild(kv);
      g.appendChild(c)});
    h.appendChild(g);
  }
  if(b.priorities&&b.priorities.length){
    var s2=el("div","sub-h");s2.appendChild(el("h2",null,"Standing priorities"));h.appendChild(s2);
    var pr=el("div","pr");
    b.priorities.forEach(function(p){var c=el("div","p");
      c.appendChild(el("div","nm",p.name||""));
      if(p.confidence)c.appendChild(el("span","conf","Confidence: "+p.confidence));
      c.appendChild(el("div","why",p.why||""));
      var d=el("dl");
      [["0 to 2 weeks",p.now],["30 to 60 days",p.next]].forEach(function(q){if(q[1]){d.appendChild(el("dt",null,q[0]));d.appendChild(el("dd",null,q[1]))}});
      c.appendChild(d);pr.appendChild(c)});
    h.appendChild(pr);
  }
  if(b.watch&&b.watch.length){
    var s3=el("div","sub-h");s3.appendChild(el("h2",null,"Watch next week"));h.appendChild(s3);
    var u=el("ul","watchlist"),lim=st.all?b.watch.length:Math.min(5,b.watch.length);
    b.watch.slice(0,lim).forEach(function(x){u.appendChild(el("li",null,x))});h.appendChild(u);
    if(b.watch.length>5){var m=el("button","more",st.all?"Show top 5 only":"Show all "+b.watch.length);m.type="button";
      m.addEventListener("click",function(){st.all=!st.all;renderBrief()});h.appendChild(m)}
  }
}

/* activity and events */
function renderActivity(){
  var h=$("act");h.textContent="";
  var t0=dayMs(today()),cnt={};
  LINES.forEach(function(l){cnt[l]=[0,0]});
  st.items.filter(live).forEach(function(i){
    if(future(i))return;var ago=(t0-dayMs(i.date))/864e5;
    (i.lines||[]).forEach(function(l){if(!cnt[l])return;if(ago<=30)cnt[l][0]++;else if(ago<=90)cnt[l][1]++})});
  var max=1;LINES.forEach(function(l){max=Math.max(max,cnt[l][0]+cnt[l][1])});
  LINES.forEach(function(l){
    var b=el("button","row");b.type="button";b.setAttribute("aria-label",l+": "+cnt[l][0]+" in last 30 days, "+cnt[l][1]+" from 31 to 90 days");
    b.appendChild(el("span","lab",l));
    var tr=el("span","trk"),a=el("span","seg30"),c=el("span","seg90");
    a.style.width=(cnt[l][0]/max*100)+"%";c.style.width=(cnt[l][1]/max*100)+"%";tr.appendChild(a);tr.appendChild(c);b.appendChild(tr);
    b.appendChild(el("span","cnt",cnt[l][0]+" / "+cnt[l][1]));
    b.addEventListener("click",function(){st.line=l;$("fline").value=l;renderFeed();$("feed").scrollIntoView({behavior:"smooth",block:"start"})});
    h.appendChild(b)});
}
function renderEvents(){
  var h=$("ev");h.textContent="";
  var rows=st.items.filter(function(i){return live(i)&&future(i)}).sort(function(a,b){return a.date.localeCompare(b.date)});
  if(!rows.length){h.appendChild(el("div","muted","No dated events yet."));return}
  rows.forEach(function(i){var e=el("div","e");e.appendChild(el("div","dt",fmtS(i.date)));
    var r=el("div");var t=el("div","t");
    if(i.url&&/^https?:\/\//.test(i.url)){var a=el("a",null,i.headline||"");a.href=i.url;a.target="_blank";a.rel="noopener";a.style.color="inherit";t.appendChild(a)}else t.textContent=i.headline||"";
    r.appendChild(t);if(i.action)r.appendChild(el("div","a",i.action));e.appendChild(r);h.appendChild(e)});
}

/* feed */
function card(i){
  var a=el("article",i.priority||"watch"),m=el("div","meta");
  var code={high:"P1",med:"P2",watch:"P3"}[i.priority]||"P3";
  var pl=(PRI.filter(function(p){return p[0]===i.priority})[0]||["","Watch"])[1];
  var pc=el("div","pc");pc.appendChild(el("b",null,code));pc.appendChild(el("span",null,pl));a.appendChild(pc);
  var bd=el("div","tbody");
  m.appendChild(el("span",null,fmt(i.date)));m.appendChild(el("span",null,i.scope||""));
  if(i.confidence)m.appendChild(el("span",null,"Confidence: "+i.confidence));
  bd.appendChild(m);
  var h=el("h3");
  if(i.url&&/^https?:\/\//.test(i.url)){var l=el("a",null,i.headline||"");l.href=i.url;l.target="_blank";l.rel="noopener";h.appendChild(l)}else h.textContent=i.headline||"";
  bd.appendChild(h);
  if(i.source)bd.appendChild(el("div","meta",i.source));
  var tg=el("div","tags");
  if(disputed(i))tg.appendChild(el("span","tag dis","Check sources"));
  (i.companies||[]).forEach(function(x){tg.appendChild(el("span","tag co",x))});
  (i.lines||[]).forEach(function(x){tg.appendChild(el("span","tag",x))});bd.appendChild(tg);
  var d=el("dl");
  [["Why it matters",i.why],["Suggested action",i.action],["Rating basis",i.basis]].forEach(function(p){if(p[1]){d.appendChild(el("dt",null,p[0]));d.appendChild(el("dd",null,p[1]))}});
  bd.appendChild(d);a.appendChild(bd);
  return a;
}
function visible(i){
  return live(i)&&(!st.pri||i.priority===st.pri)&&(!st.scope||i.scope===st.scope)&&(!st.line||(i.lines||[]).indexOf(st.line)>=0)&&(!st.co||(i.companies||[]).indexOf(st.co)>=0)}
function renderFeed(){
  var f=$("feed");f.textContent="";
  var all=st.items.filter(live),rows=all.filter(visible);
  $("count").textContent=rows.length+" of "+all.length+" items";
  if(!rows.length){f.appendChild(el("div","empty",all.length?"No items match these filters.":"No items yet. The agent adds items on each refresh."));return}
  rows.forEach(function(i){f.appendChild(card(i))});
}
function fillCompanies(){
  var names={};st.watch.forEach(function(w){if(w.name)names[w.name]=1});
  st.items.forEach(function(i){(i.companies||[]).forEach(function(c){names[c]=1})});
  var sel=$("fco"),cur=sel.value;sel.textContent="";var o=el("option",null,"All");o.value="";sel.appendChild(o);
  Object.keys(names).sort().forEach(function(n){var x=el("option",null,n);x.value=n;sel.appendChild(x)});
  sel.value=names[cur]?cur:"";st.co=sel.value;
}

function sortItems(a){a.sort(function(x,y){return (y.date||"").localeCompare(x.date||"")})}
function renderItems(){renderTiles();renderActivity();renderEvents();fillCompanies();renderFeed()}
function load(name){return fetch("data/"+name+".json?t="+Date.now(),{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error(name);return r.json()})}
function refresh(){
  return Promise.all([load("brief"),load("items"),load("watchlist")]).then(function(r){
    st.brief=r[0];st.items=r[1];st.watch=r[2];sortItems(st.items);
    renderBrief();renderLink();renderItems();
  }).catch(function(){
    var f=$("feed");if(!st.items.length){f.textContent="";f.appendChild(el("div","empty","Could not load data. Check your connection and reload."))}
    $("linkS").textContent="offline";$("link").className="link bad"});
}
setInterval(renderLink,60000);
setInterval(refresh,15*60000);
document.addEventListener("visibilitychange",function(){if(!document.hidden)refresh()});
renderTiles();renderActivity();
refresh();
if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})})}

})();
