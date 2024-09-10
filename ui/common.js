export default {
    stacksWithChange(stacks, change) {
        // returns stacks with specified change (create, delete, update)
        return stacks.filter((s) => (s.resource_diffs || [])
            .map((d) => d.actions)
            .flat()
            .includes(change))
    },
    stacksWithAnyChange(stacks) {
        return this.nonErroredStacks(stacks).filter((s) => s.resource_diffs?.length > 0)
    },
    stacksWithZeroDiff(stacks) {
        return this.nonErroredStacks(stacks).filter((s) => (s.resource_diffs || []).length === 0)
    },
    stacksWithOutputChanges(stacks) {
        return this.nonErroredStacks(stacks).filter((s) => s?.output_diffs?.length > 0)
    },
    stacksWithDrifts(stacks) {
        return this.nonErroredStacks(stacks).filter((s) => s?.drift_diffs?.length > 0)
    },
    stacksWithMoves(stacks) {
        return this.nonErroredStacks(stacks).filter((s) => s?.moves?.length > 0)
    },
    lockedStacks(stacks) {
        return stacks.filter((s) => s.lock_url)
    },
    nonErroredStacks(stacks) {
        return stacks.filter((s) => !s.plan_error)
    },
    erroredStacks(stacks) {
        return stacks.filter((s) => s.plan_error && !s.lock_url)
    },

}
