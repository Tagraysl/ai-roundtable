// Separate task input from supporting evidence without inventing evidence.
function taskGuidance({workflow=false,hasUpstreamAnswer=false}={}){
 return '用户提出的问题本身就是任务，不要求用户必须上传资料。缺少附件不等于没有任务。请在当前职责范围内直接推进用户目标，区分已知知识、推测和待核实事实；需要最新统计时，若有联网工具则查询可靠来源，否则说明无法核实具体数字并给出可用的查询口径或必要的澄清问题，禁止编造数据或假装联网。'+(workflow?(hasUpstreamAnswer?'检查上游成果时，逐项评估已有内容，不能把未附文件误认为没有上游成果。':'当前直接上游没有 AI 产出的方案或回答。若职责是检查或验收，不能虚构待审查成果，也不要只回复“未提供资料”；应针对原始问题说明需要核实的要点、已能提供的帮助和后续所需证据。'):'');
}
module.exports={taskGuidance};
