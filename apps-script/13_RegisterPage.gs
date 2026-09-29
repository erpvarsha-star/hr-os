/**
 * 13_RegisterPage.gs - the HTML page of the monthly attendance register and its entry points.
 *  - menu "HR OS > Month > Open monthly attendance register" opens it as a modal dialog (no deployment needed);
 *  - doGet serves the same page when the script is also deployed as a web app (deploy "Execute as: User accessing the
 *    web app" so the runner's email is known; every server call checks it, see register_requireUser_).
 * The page never reads or shows anything but employee code, name and the days figure.
 */
function registerPageHtml_() {
  return [
    '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">',
    '<title>Monthly attendance register</title>',
    '<style>',
    'body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#202124}',
    'h2{margin:0 0 8px}fieldset{margin:10px 0;border:1px solid #c9ced6;border-radius:4px}',
    'legend{font-weight:bold}label{margin-right:16px}',
    'table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #d5d9e0;padding:4px 8px;text-align:left}',
    'th{background:#f1f3f4;position:sticky;top:0}td.num{width:140px}input.days{width:100px}',
    '.pop td{background:#e8eefc;font-weight:bold}.note{color:#5f6368;font-size:12px}',
    '#msg{margin-top:12px;white-space:pre-wrap}.err{color:#b00020}.ok{color:#1b7f3b}',
    'button{padding:6px 14px;margin-right:8px}',
    '</style></head><body>',
    '<h2>Monthly attendance register</h2>',
    '<div>Period <input id="period" type="month"> <button id="load">Load</button>',
    ' <span class="note">One number per employee. Weekly offs, holidays and approved leave are added automatically.</span></div>',
    '<div id="cats"></div>',
    '<table id="tbl"><thead><tr><th>Employee</th><th>Days present</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table>',
    '<p><button id="submit" disabled>Submit register</button><span class="note">Only PENDING attendance rows are written; approved or locked rows are skipped.</span></p>',
    '<div id="msg"></div>',
    '<script>',
    'var state=null;',
    'function el(t,a,txt){var e=document.createElement(t);if(a)for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e;}',
    'function say(t,c){var m=document.getElementById("msg");m.className=c||"";m.textContent=t;}',
    'function fail(e){say(String(e&&e.message?e.message:e),"err");document.getElementById("submit").disabled=false;}',
    'function render(d){',
    ' state=d;say("");document.getElementById("period").value=d.period;',
    ' var cats=document.getElementById("cats");cats.textContent="";',
    ' d.populations.forEach(function(p){',
    '  var f=el("fieldset");f.appendChild(el("legend",null,p.population));',
    '  [["N","Days present EXCLUDES weekly offs"],["Y","Days present INCLUDES weekly offs"]].forEach(function(o){',
    '   var l=el("label");var r=el("input",{type:"radio",name:"inc_"+p.population,value:o[0]});if(p.includesWO===o[0])r.checked=true;',
    '   l.appendChild(r);l.appendChild(document.createTextNode(" "+o[1]));f.appendChild(l);});',
    '  cats.appendChild(f);});',
    ' var body=document.getElementById("rows");body.textContent="";var last="";',
    ' d.employees.forEach(function(e){',
    '  if(e.population!==last){last=e.population;var h=el("tr",{"class":"pop"});var c=el("td",{colspan:"3"},e.population);h.appendChild(c);body.appendChild(h);}',
    '  var tr=el("tr");tr.appendChild(el("td",null,e.empId+" \\u2013 "+e.name));',
    '  var td=el("td",{"class":"num"});var i=el("input",{type:"number","class":"days","data-emp":e.empId,min:"0",max:String(d.daysInMonth),step:"0.5"});',
    '  if(e.days!=="")i.value=e.days;if(e.state!=="OPEN")i.disabled=true;td.appendChild(i);tr.appendChild(td);',
    '  tr.appendChild(el("td",null,e.state==="OPEN"?"":e.state));body.appendChild(tr);});',
    ' document.getElementById("submit").disabled=false;}',
    'document.getElementById("load").onclick=function(){say("Loading...");',
    ' google.script.run.withSuccessHandler(render).withFailureHandler(fail).registerApiLoad(document.getElementById("period").value||"");};',
    'document.getElementById("submit").onclick=function(){',
    ' if(!state)return;var inc={};state.populations.forEach(function(p){var r=document.querySelector("input[name=inc_"+p.population+"]:checked");inc[p.population]=r?r.value:"N";});',
    ' var entries=[];Array.prototype.forEach.call(document.querySelectorAll("input.days"),function(i){if(i.disabled)return;entries.push({empId:i.getAttribute("data-emp"),days:i.value});});',
    ' document.getElementById("submit").disabled=true;say("Saving...");',
    ' google.script.run.withSuccessHandler(function(r){document.getElementById("submit").disabled=false;',
    '  var t="Saved "+r.written+" row(s) ("+r.created+" new, "+r.updated+" updated).";',
    '  if(r.notEntered.length)t+="\\nNot entered: "+r.notEntered.length;',
    '  if(r.skippedApproved.length)t+="\\nSkipped (already APPROVED): "+r.skippedApproved.join(", ");',
    '  if(r.skippedLocked.length)t+="\\nSkipped (LOCKED): "+r.skippedLocked.join(", ");',
    '  if(r.exceptions.length)t+="\\nEXCEPTIONS (employee will be on HOLD): "+r.exceptions.map(function(x){return x.EMP_ID+" "+x.code;}).join("; ");',
    '  if(r.warnings.length)t+="\\nWarnings: "+r.warnings.map(function(x){return x.EMP_ID+" "+x.code;}).join("; ");',
    '  say(t,r.exceptions.length?"err":"ok");}).withFailureHandler(fail).registerApiSubmit({period:state.period,includesWO:inc,entries:entries});};',
    'document.getElementById("load").click();',
    '</script></body></html>'
  ].join('\n');
}

/** Web-app entry (only used when the script is deployed as a web app). */
function doGet(e) {
  return HtmlService.createHtmlOutput(registerPageHtml_()).setTitle('HR OS - Monthly attendance register');
}

/** Menu entry: the register as a modal dialog of the spreadsheet (no deployment needed). */
function registerOpenDialog() {
  var out = HtmlService.createHtmlOutput(registerPageHtml_()).setWidth(980).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(out, 'Monthly attendance register');
  return null;
}

/** google.script.run: page data. */
function registerApiLoad(period) { return JSON.parse(JSON.stringify(registerLoad(period))); }

/** google.script.run: submit. Serialised with the script lock so two submissions cannot interleave. */
function registerApiSubmit(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return JSON.parse(JSON.stringify(registerSubmit(payload)));
  } finally {
    lock.releaseLock();
  }
}
