import Counter from "./counter.js";
import common from './common.js'

export default {
    components: { Counter },
    props: ['stacks'],
    computed: {
        counters() {
            return {
                diffs: common.stacksWithAnyChange(this.stacks).length,
                creates: common.stacksWithChange(this.stacks, 'create').length,
                updates: common.stacksWithChange(this.stacks, 'update').length,
                deletes: common.stacksWithChange(this.stacks, 'delete').length,
                zerodiff: common.stacksWithZeroDiff(this.stacks).length,
                outputs: common.stacksWithOutputChanges(this.stacks).length,
                drifts: common.stacksWithDrifts(this.stacks).length,
                moves: common.stacksWithMoves(this.stacks).length,
                locked: common.lockedStacks(this.stacks).length,
                errored: common.erroredStacks(this.stacks).length,
            }
        },
    },
    template: `
        <span class="h6">Total stacks: {{ stacks?.length }}</span>
        <span class="h6 ms-2 me-2">With</span>
        <Counter v-if="counters.creates" color="green" icon="patch-plus-fill" nomono
                :value="'creates: ' + counters.creates"></Counter>
        <Counter v-if="counters.updates" color="orange" icon="patch-exclamation-fill" nomono
                :value="'updates: ' + counters.updates"></Counter>
        <Counter v-if="counters.deletes" color="red" icon="patch-minus-fill" nomono
                :value="'deletes: ' + counters.deletes"></Counter>
        <Counter v-if="counters.diffs" color="gray-dark" icon="asterisk" nomono
                :value="'any diffs: ' + counters.diffs"></Counter>
        <Counter v-if="counters.zerodiff" color="gray" icon="patch-check-fill" nomono
                :value="'zero-diff: ' + counters.zerodiff"></Counter>
        <br>
        <Counter v-if="counters.outputs" color="blue" icon="diagram-2-fill" nomono
                :value="'output changes: ' + counters.outputs"></Counter>
        <Counter v-if="counters.drifts" color="indigo" icon="arrow-down-left-circle-fill" nomono
                :value="'remote changes: ' + counters.drifts"></Counter>
        <Counter v-if="counters.moves" color="purple" icon="arrow-left-right" nomono
                :value="'moves: ' + counters.moves"></Counter>
        <Counter v-if="counters.errored" color="yellow" icon="exclamation-octagon-fill" nomono
                :value="'errored: ' + counters.errored"></Counter>
        <Counter v-if="counters.locked" color="yellow" icon="hourglass-bottom" nomono
                :value="'locked: ' + counters.locked"></Counter>
`
}
