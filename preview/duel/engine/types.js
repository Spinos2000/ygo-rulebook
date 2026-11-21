// エンジンで使う型定義

                             

                          
                                       
                                  
                                          
                                     
                                                                   
                     
                
                 
               
               
                                            
                                                    
                                   
                                   
 

                                                                                                                     // none：フィールドを離れて消えたトークン

                           
              
               
                  
                       
                 
                                    
                                                                     
                  
                                                       
                                                 
                                     
                              
                                   
                                                          
                             
                                                                              
                                                        
                            
                                                                         
                                                          
                                                     
                                                                                                               
                                                                                                              
                               
                                                                       
                                                                  
                                                                        
                                                                                                  
 

                                                                              

                              
             
                                    
                 
                                
                     
                  
                                 
                                 
                       
                            
 

/* ---------- 出来事（誘発効果・「〜した時」の判定に使う） ---------- */
                       
                                                                                                                                                            
                                                      
                                                                                                                   
                                                      
                                                                                                                                                                                                                   
                                                                                   
                                                                                 
                                                                                   
                                                                                                         
                                                                                                       
                                                  
                                                                                       
                                                                
                                                                 
                                                                   
                                                             
                                                                                       
                                                                                                          
                                                          
                                                                                                                                      

                                                                                                                    

/* ---------- チェーン ---------- */
                            
                   
              
                 
                                  
                
                                                        
                                         
                    
                          
                                
                                       
                                       
 

/* ---------- 優先権・タイミング ---------- */
                  
                    
                                
                       
                                                                 
                                                                                                     
                                         

                                                                                                         

                    
                                                                   
                                                                                                                

                              
                   
                         
                        
                              
                                                        
                   
                                                 
                                                                              
                                                    
                                                
                                                              
                                                        
                      
                                                                                                                       
 

/* ---------- 選択 ---------- */
                           
                                                                                                                       
                                                       
                                                                            

/** カード選択の追加条件（保存できる形で書く） */
                        
                                                                            
                                          
                              

                  
                                                                                      
                           
                                        
                         
                                        
                          
                                                          

                          
                         
             
                     
                                                   
 

                            
                                                                     
                                                                                                                 
                                                                          
                                                                           
                                                                  
                                                                 
                                                                                                                           
                                                                                                        
                                                                                       
                    
                                                                        
                                                                        
                                                                           
                                                                                                
                                                              
                                                                  
                                                                               
                                                                        
                                                                                                                                                                           
                    
                
               
                  
               
                     
                        
                           
                   
                  
 

                            
               
              
               
                       
                        
               
                                      
                                      
                                  
                  
                 
                     
                                                                   
                                                
                                                  
                                                
                                                       
                                                                
                                                 
                                                              
                         
                             
                                         
                                                                                                            
                                               
                               
                                             
                                         
                                                                                                       
                                                   
                           
                                            
                                                                                                                                                       
                                                                                                
                                                                                                                
                                                                
                                                                                     
                                                                          
                                                                                                                                         
                                                
                                                                                                  
                                                                                                       
                                                                                                          
                                
                      
                                                                      
                       
                   
                                   
                           
                  
 

                              
              
                                                            
                 
                   
                     
                                                   
               
                   
 

                                                        

                    
                                    
                       
                                                                             
                                                                           
                                        
                                            
                                                         
                                                               
                                                                                                          
                                                                                           
                    
                                                                                            
                                      
                                            

export class RuleError extends Error {
  constructor(message        ) { super(message); this.name = 'RuleError'; }
}

/** 状態の複製（structuredClone より速い。状態は普通のオブジェクトと配列だけでできている前提） */
export function deepClone   (v   )    {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length, a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = deepClone(v[i]);
    return a     ;
  }
  const o                          = {};
  for (const k in v) o[k] = deepClone((v                           )[k]);
  return o     ;
}

export function cloneCard(c          )           {
  const n           = { ...c, counters: { ...c.counters } };
  if (c.mods) n.mods = c.mods.map(m => ({ ...m }));
  if (c.tributedWith) n.tributedWith = c.tributedWith.slice();
  if (c.attackedList) n.attackedList = c.attackedList.slice();
  return n;
}
function clonePlayer(p             )              {
  return { ...p, deck: p.deck.slice(), hand: p.hand.slice(), gy: p.gy.slice(), banished: p.banished.slice(), extra: p.extra.slice(), mzone: p.mzone.slice(), szone: p.szone.slice() };
}
/** ゲームの状態の複製（カードとプレイヤーは形が決まっているので速く写す） */
export function cloneState(s           )            {
  const o                          = {};
  for (const k in s) {
    const v = (s                                      )[k];
    if (k === 'cards') {
      const cs                           = {};
      for (const u in s.cards) cs[u                     ] = cloneCard(s.cards[u                     ]);
      o[k] = cs;
    } else if (k === 'players') o[k] = [clonePlayer(s.players[0]), clonePlayer(s.players[1])];
    else if (k === 'log' || k === 'anim') o[k] = (v                         )?.slice(); // 追記するだけなので中身は共有してよい
    else if (k === 'pending' && s.pending) o[k] = { ...deepClone({ ...s.pending, base: null }), base: cloneState(s.pending.base) };
    else o[k] = deepClone(v);
  }
  return o                        ;
}
