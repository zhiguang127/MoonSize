// Reconstruct the predecessor forest computed by the MoonBit core. No new
// reachability inference happens in the presentation layer.
export function referencePath(graph, index) {
  const node=graph?.nodes[index];
  if(!node)return {status:'unavailable',root:null,edges:[]};
  if(node.root_index===null)return {status:'no_known_path',root:null,edges:[]};
  const edges=[];
  let current=node;
  while(current.parent_edge!==null){
    const edge=graph.edges[current.parent_edge];
    if(!edge||edges.length>=graph.nodes.length)return {status:'unavailable',root:null,edges:[]};
    edges.push(edge);current=graph.nodes[edge.source_index];
    if(!current)return {status:'unavailable',root:null,edges:[]};
  }
  return {status:'known_reference_path',root:graph.roots[node.root_index],edges:edges.reverse()};
}
