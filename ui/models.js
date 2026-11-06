class Pull {
    constructor(raw) {
        this.executableName = raw["executable_name"]
        this.prNum = raw["pr_num"]
        this.prRepo = raw["pr_repo"]
        this.prURL = raw["pr_url"]

        // Drift mode
        this.isDriftMode = raw["is_drift_mode"] || false
        this.driftRunnerID = raw["drift_runner_id"] || ""

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
        this.errorLog = raw["error_log"] || ""

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

// Resources index: all diffs of all stacks flattened into instances and grouped
// according to the selected mode.

// Splits a Terraform address into segments, keeping index keys (which may contain
// dots, e.g. ["maintenance.googleapis.com"]) attached to their segment.
function parseAddress(address) {
    const segments = []
    let i = 0
    while (i < address.length) {
        let name = ""
        while (i < address.length && address[i] !== "." && address[i] !== "[") {
            name += address[i++]
        }
        let key = null
        if (address[i] === "[") {
            let j = i + 1
            let inString = false
            while (j < address.length) {
                const c = address[j]
                if (inString) {
                    if (c === "\\") j++
                    else if (c === '"') inString = false
                } else if (c === '"') {
                    inString = true
                } else if (c === "]") {
                    break
                }
                j++
            }
            key = address.substring(i, j + 1)
            i = j + 1
        }
        segments.push({ name, key })
        if (address[i] === ".") i++
    }
    return segments
}

function resourceStart(segments) {
    let n = segments.length
    if (n >= 3 && segments[n - 3].name === "data" && segments[n - 3].key === null) {
        return n - 3
    }
    return Math.max(0, n - 2)
}

function resourceType(segments) {
    const start = resourceStart(segments)
    const s = segments.slice(start, segments.length - 1).map((s) => s.name)
    return s.join(".")
}

function categoryOf(kind, actions, importID) {
    if (kind === "drift") return "drift"
    if (kind === "move") return "move"
    const a = (actions || []).join(",")
    if (a === "create") return "create"
    if (a === "update") return "update"
    if (a === "delete") return "delete"
    if (a === "delete,create" || a === "create,delete") return "replace"
    if (a.startsWith("forget")) return "forget"
    if (importID) return "import"
    return "noop"
}

const CATEGORIES = [
    { name: "create", icon: "patch-plus-fill", color: "green", title: "Create" },
    { name: "update", icon: "patch-exclamation-fill", color: "orange", title: "Update in-place" },
    { name: "replace", icon: "arrow-repeat", color: "red", title: "Replace" },
    { name: "delete", icon: "patch-minus-fill", color: "red", title: "Delete" },
    { name: "drift", icon: "arrow-down-left-circle-fill", color: "indigo", title: "Remote change (drift)" },
    { name: "move", icon: "arrow-left-right", color: "purple", title: "Move" },
    { name: "import", icon: "box-arrow-in-down-left", color: "purple", title: "Import" },
    { name: "forget", icon: "x-circle", color: "purple", title: "Forget" },
    { name: "noop", icon: "dash-circle", color: "gray", title: "No-op" },
]

class Instance {
    constructor(stack, diff, kind) {
        this.stackPath = stack.path
        this.stackPathSanitized = stack.pathSanitized
        this.address = diff.address
        this.previousAddress = diff.previousAddress
        this.kind = kind
        this.category = categoryOf(kind, diff.actions, diff.importID)
        this.segments = parseAddress(diff.address)
        this.type = resourceType(this.segments)
    }
}

function collectInstances(stacks) {
    const res = []
    for (const stack of stacks) {
        if (stack.planError || stack.locked) continue
        for (const d of stack.resourceDiffs) res.push(new Instance(stack, d, "resource"))
        for (const d of stack.driftDiffs) res.push(new Instance(stack, d, "drift"))
        for (const d of stack.moves) res.push(new Instance(stack, d, "move"))
    }
    return res
}

const MODES = [
    { name: "address", title: "Address", hint: "Full address, index keys masked (click [×N] to split by a key)" },
    { name: "resource", title: "Resource", hint: "type.name, ignoring the module path" },
    { name: "type", title: "Type", hint: "Resource type only" },
]

function labelParts(inst, mode) {
    if (mode === "type") {
        return { template: inst.type, parts: [{ text: inst.type }] }
    }
    const segs = mode === "resource" ? inst.segments.slice(resourceStart(inst.segments)) : inst.segments
    const template = segs.map((s) => s.name + (s.key !== null ? "[*]" : "")).join(".")
    const parts = []
    segs.forEach((s, i) => {
        parts.push({ text: (i > 0 ? "." : "") + s.name })
        if (s.key !== null) {
            parts.push({ keyPos: i, key: s.key })
        }
    })
    return { template, parts }
}

// A resource can show up in a stack more than once, e.g. as an update and as the
// drift behind it, so instances are also merged by address.
function groupByStack(instances) {
    const byStack = new Map()
    for (const inst of instances) {
        if (!byStack.has(inst.stackPath)) {
            byStack.set(inst.stackPath, { path: inst.stackPath, pathSanitized: inst.stackPathSanitized, resources: new Map() })
        }
        const resources = byStack.get(inst.stackPath).resources
        if (!resources.has(inst.address)) {
            resources.set(inst.address, { address: inst.address, previousAddress: inst.previousAddress, instances: [] })
        }
        resources.get(inst.address).instances.push(inst)
    }
    return [...byStack.values()]
        .map((s) => ({ ...s, resources: [...s.resources.values()] }))
        .sort((l, r) => l.path.localeCompare(r.path))
}

// Getters are cached: a group is immutable once buildGroups returns it.
class Group {
    constructor(id, template, parts) {
        this.id = id
        this.template = template
        this.parts = parts // key parts carry {keyPos, splitID, split, values: Set}
        this.instances = []
        this.cache = {}
    }

    cached(name, fn) {
        if (!(name in this.cache)) this.cache[name] = fn()
        return this.cache[name]
    }

    get stacks() {
        return this.cached("stacks", () => groupByStack(this.instances))
    }

    get stackCount() {
        return this.cached("stackCount", () => new Set(this.instances.map((i) => i.stackPath)).size)
    }

    get counts() {
        return this.cached("counts", () => {
            const c = {}
            for (const inst of this.instances) c[inst.category] = (c[inst.category] || 0) + 1
            return c
        })
    }

    get label() {
        return this.cached("label", () => this.parts.map((p) => {
            if (p.text !== undefined) return p.text
            if (p.split || p.values.size === 1) return [...p.values][0]
            return "[*]"
        }).join(""))
    }
}

// splits: Set of "<template>#<keyPos>" whose keys are not masked.
function buildGroups(instances, mode, splits) {
    const groups = new Map()
    for (const inst of instances) {
        const { template, parts } = labelParts(inst, mode)
        let id = mode + ":"
        for (const p of parts) {
            if (p.text !== undefined) id += p.text
            else id += splits.has(template + "#" + p.keyPos) ? p.key : "[*]"
        }
        if (!groups.has(id)) {
            groups.set(id, new Group(id, template, parts.map((p) => p.text !== undefined ? { text: p.text } : {
                keyPos: p.keyPos,
                splitID: template + "#" + p.keyPos,
                split: splits.has(template + "#" + p.keyPos),
                values: new Set(),
            })))
        }
        const g = groups.get(id)
        g.instances.push(inst)
        parts.forEach((p, i) => {
            if (p.text === undefined) g.parts[i].values.add(p.key)
        })
    }
    return [...groups.values()]
}

export { Pull, Stack, Diff, MODES, CATEGORIES, collectInstances, buildGroups }
