function selectedResume(graph,previous,nodeId){
 const ancestors=new Set();let changed=true;while(changed){changed=false;for(const [a,b]of graph.edges)if((b===nodeId||ancestors.has(b))&&!ancestors.has(a)){ancestors.add(a);changed=true;}}
 const missing=[...ancestors].filter(id=>previous.nodes[id]?.status!=='complete');if(missing.length)throw Error('请先重试上游未完成的积木：'+missing.map(id=>graph.nodes.find(n=>n.id===id)?.title||id).join('、'));
 const selected=new Set([nodeId]);changed=true;while(changed){changed=false;for(const [a,b]of graph.edges)if(selected.has(a)&&!selected.has(b)&&previous.nodes[b]?.status!=='error'){selected.add(b);changed=true;}}
 return selected;
}module.exports={selectedResume};
