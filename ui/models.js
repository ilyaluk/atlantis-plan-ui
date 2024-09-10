class Pull {
    constructor(raw) {
        this.executableName = raw["executable_name"]
        this.prNum = raw["pr_num"]
        this.prRepo = raw["pr_repo"]
        this.prURL = raw["pr_url"]

        this.stacks = []
        for (const stackRaw of (raw["stacks"] || [])) {
            this.stacks.push(new Stack(stackRaw))
        }

        console.log(this)
    }

    stacksWithChange(change) {
        // returns stacks with specified change (create, delete, update)
        return this.stacks.filter(
            (s) => s.resourceDiffs.map((d) => d.actions).flat().includes(change)
        )
    }
    get stacksWithAnyChange() {
        return this.nonErroredStacks.filter((s) => s.resourceDiffs.length > 0)
    }
    get stacksWithZeroDiff() {
        return this.nonErroredStacks.filter((s) => s.resourceDiffs.length === 0)
    }
    get stacksWithOutputChanges() {
        return this.nonErroredStacks.filter((s) => s.outputDiffs.length > 0)
    }
    get stacksWithDrifts() {
        return this.nonErroredStacks.filter((s) => s.driftDiffs.length > 0)
    }
    get stacksWithMoves() {
        return this.nonErroredStacks.filter((s) => s.moves.length > 0)
    }
    get stacksWithImports() {
        return this.nonErroredStacks.filter((s) => s.importsNum > 0)
    }
    get stacksWithForgets() {
        return this.nonErroredStacks.filter((s) => s.forgetsNum > 0)
    }
    get lockedStacks() {
        return this.stacks.filter((s) => s.locked)
    }
    get nonErroredStacks() {
        return this.stacks.filter((s) => !s.planError)
    }
    get erroredStacks() {
        return this.stacks.filter((s) => s.planError && !s.locked)
    }
}

let sanitize = (val) => val.replaceAll(/[^a-zA-Z0-9-_]/g, "-")

class Stack {
    constructor(raw) {
        this.name = raw["name"] || ""
        this.path = raw["path"] || ""
        this.logURL = raw["log_url"] || ""
        this.planError = raw["plan_error"] || false

        this.locked = false
        if (raw["lock_url"]) {
            this.locked = true

            this.lockURL = raw["lock_url"]
            this.lockPRURL = raw["lock_pr_url"]
            this.lockPRAuthor = raw["lock_pr_author"]
        }

        this.resourceDiffs = (raw["resource_diffs"] || []).map(
            (el) => new Diff(el, this.pathSanitized, "resource")
        )
        this.outputDiffs = (raw["output_diffs"] || []).map(
            (el) => new Diff(el, this.pathSanitized, "output")
        )
        this.driftDiffs = (raw["drift_diffs"] || []).map(
            (el) => new Diff(el, this.pathSanitized, "drift")
        )
        this.moves = (raw["moves"] || []).map(
            (el) => new Diff(el, this.pathSanitized, "move")
        )
    }

    get pathSanitized() {
        return sanitize(this.path)
    }

    get createsNum() {
        return this.resourceDiffs.filter((d) => d.actions.includes('create')).length
    }
    get deletesNum() {
        return this.resourceDiffs.filter((d) => d.actions.includes('delete')).length
    }
    get updatesNum() {
        return this.resourceDiffs.filter((d) => d.actions.includes('update')).length
    }
    get forgetsNum() {
        return this.resourceDiffs.filter((d) => d.actions.includes('forget')).length
    }
    get importsNum() {
        return this.resourceDiffs.filter((d) => d.importID).length
    }

    get resourceDiffsSorted() {
        const idxs = {
            "delete": 0,
            "delete,create": 1,
            "create,delete": 2,
            "create": 3,
            "update": 4,
            "forget": 5,
            "forget,create": 6,
            "no-op": 7,
        }
        return [...this.resourceDiffs].sort((l, r) => {
            let lt = l.actions.join(',')
            let rt = r.actions.join(',')
            if (lt !== rt) {
                return idxs[lt] - idxs[rt]
            }
            return l.address.localeCompare(r.address)
        })
    }
}

class Diff {
    constructor(raw, stackPath, type) {
        this.address = raw["address"]
        if (raw["actions"])
            this.actions = raw["actions"]
        if (raw["diff"])
            this.diff = raw["diff"]
        if (raw["previous_address"])
            this.previousAddress = raw["previous_address"]
        if (raw["import_id"])
            this.importID = raw["import_id"]

        this.stackPath = stackPath
        this.type = type
    }

    get addressSanitized() {
        return `${this.stackPath}__${this.type}_${sanitize(this.address)}`
    }
}

export { Pull, Stack, Diff }