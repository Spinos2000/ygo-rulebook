/* あのころ遊戯王：電波が弱くても開けるようにするサービスワーカー
   ・ページ本体：まずネット（最新）→ つながらなければ保存しておいたもの
   ・音・アイコン・フォント・Firebaseの部品：保存しておいたものをすぐ使い、裏で更新
   ・Firestoreなどのデータ通信は触らない（Firebase側がオフライン保存を担当） */
var VER='ygo-v1';
var CORE=['./','./index.html','./preview/','./preview/index.html','./manifest.webmanifest','./sounds/duel-start.mp3','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(VER).then(function(c){return Promise.all(CORE.map(function(u){return c.add(new Request(u,{cache:'reload'})).catch(function(){});}));}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==VER;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
function pageKey(url){var u=new URL(url);u.search='';u.hash='';if(u.pathname.endsWith('/index.html'))u.pathname=u.pathname.slice(0,-10);return u.toString();}
self.addEventListener('fetch',function(e){var req=e.request;if(req.method!=='GET')return;var url=new URL(req.url);
  /* ページ本体 */
  if(req.mode==='navigate'){var key=pageKey(req.url);
    e.respondWith(new Promise(function(resolve){var done=false;
      var t=setTimeout(function(){caches.match(key).then(function(r){if(r&&!done){done=true;resolve(r);}});},3500);
      fetch(req).then(function(res){if(res&&res.ok){var cp=res.clone();caches.open(VER).then(function(c){c.put(key,cp);});}if(!done){done=true;clearTimeout(t);resolve(res);}})
        .catch(function(){caches.match(key).then(function(r){if(!done){done=true;clearTimeout(t);resolve(r||caches.match(pageKey(new URL('./',self.registration.scope).toString())));}});});}));
    return;}
  var host=url.hostname,same=url.origin===self.location.origin;
  var asset=(same&&/\/(sounds|icons)\/|manifest\.webmanifest$/.test(url.pathname))||host==='fonts.googleapis.com'||host==='fonts.gstatic.com'||(host==='www.gstatic.com'&&/firebasejs/.test(url.pathname));
  if(!asset)return;
  e.respondWith(caches.open(VER).then(function(c){return c.match(req).then(function(hit){
    var net=fetch(req).then(function(res){if(res&&(res.ok||res.type==='opaque'))c.put(req,res.clone());return res;}).catch(function(){return hit;});
    return hit||net;});}));});
