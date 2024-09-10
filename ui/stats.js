import Counter from "./counter.js";
import {Pull} from "./models.js";


export default {
    components: { Counter },
    props: {
        pull: {
            type: Pull,
            default: new Pull({}),
        }
    },
    computed: {
        diffs() { return this.pull.stacksWithAnyChange.length },
        creates() { return this.pull.stacksWithChange('create').length },
        updates() { return this.pull.stacksWithChange('update').length },
        deletes() { return this.pull.stacksWithChange('delete').length },
        zerodiff() { return this.pull.stacksWithZeroDiff.length },
        outputs() { return this.pull.stacksWithOutputChanges.length },
        drifts() { return this.pull.stacksWithDrifts.length },
        moves() { return this.pull.stacksWithMoves.length },
        imports() { return this.pull.stacksWithImports.length },
        forgets() { return this.pull.stacksWithForgets.length },
        locked() { return this.pull.lockedStacks.length },
        errored() { return this.pull.erroredStacks.length },
    },
    template: `
        <span class="h6 me-2">Total stacks: {{ this.pull.stacks.length }}</span>
        <Counter v-if="errored" color="yellow" icon="exclamation-octagon-fill" nomono
                :value="'errored: ' + errored"></Counter>
        <Counter v-if="locked" color="yellow" icon="hourglass-bottom" nomono
                :value="'locked: ' + locked"></Counter>
        <br>
        <span class="h6 me-2">With</span>
        <Counter v-if="creates" color="green" icon="patch-plus-fill" nomono
                :value="'creates: ' + creates"></Counter>
        <Counter v-if="updates" color="orange" icon="patch-exclamation-fill" nomono
                :value="'updates: ' + updates"></Counter>
        <Counter v-if="deletes" color="red" icon="patch-minus-fill" nomono
                :value="'deletes: ' + deletes"></Counter>
        <Counter v-if="diffs" color="gray-dark" icon="asterisk" nomono
                :value="'any diffs: ' + diffs"></Counter>
        <Counter v-if="zerodiff" color="gray" icon="patch-check-fill" nomono
                :value="'zero-diff: ' + zerodiff"></Counter>
        <br>
        <Counter v-if="outputs" color="blue" icon="diagram-2-fill" nomono
                :value="'output changes: ' + outputs"></Counter>
        <Counter v-if="drifts" color="indigo" icon="arrow-down-left-circle-fill" nomono
                :value="'remote changes: ' + drifts"></Counter>
        <Counter v-if="moves" color="purple" icon="arrow-left-right" nomono
                :value="'moves: ' + moves"></Counter>
        <Counter v-if="imports" color="purple" icon="box-arrow-in-down-left" nomono
                :value="'imports: ' + imports"></Counter>
        <Counter v-if="forgets" color="purple" icon="x-circle" nomono
                :value="'forgets: ' + forgets"></Counter>
`
}
