import Counter from "./counter.js";
import { MODES, CATEGORIES, collectInstances, buildGroups } from "./models.js";

const RENDER_LIMIT = 200
const INSTANCES_PER_STACK = 5

// Links to each diff of a resource that changes in several ways, e.g. an update
// and the drift behind it.
const KindLinks = {
    props: { res: Object },
    emits: ['navigate'],
    methods: {
        category(inst) {
            return CATEGORIES.find((c) => c.name === inst.category)
        },
    },
    template: `
        <template v-if="res.instances.length > 1">
            <a v-for="inst in res.instances" href="#" @click.prevent="$emit('navigate', inst)"
               :class="'ms-1 text-decoration-none color-' + category(inst).color" :title="category(inst).title">
                <i :class="'bi-' + category(inst).icon"></i></a>
        </template>`
}

export default {
    components: { Counter, KindLinks },
    props: {
        stacks: {
            type: Array,
            default: [],
        }
    },
    emits: ['navigate'],
    data() {
        return {
            open: false,
            modes: MODES,
            categories: CATEGORIES,
            mode: "address",
            sort: "name",
            filter: "",
            splits: new Set(),
            expanded: {},
            expandedStacks: {},
            showAll: false,
        }
    },
    watch: {
        mode() {
            this.expanded = {}
        },
    },
    computed: {
        instances() {
            return Vue.markRaw(collectInstances(this.stacks))
        },
        // Resource groups are unions of Address groups, so equal counts mean
        // identical groupings.
        availableModes() {
            const count = (mode) => buildGroups(this.instances, mode, new Set()).length
            if (count("resource") === count("address")) {
                return this.modes.filter((m) => m.name !== "resource")
            }
            return this.modes
        },
        groups() {
            const groups = buildGroups(this.instances, this.mode, this.splits).map((g) => Vue.markRaw(g))
            if (this.sort === "count") {
                groups.sort((l, r) => r.instances.length - l.instances.length || l.label.localeCompare(r.label))
            } else {
                groups.sort((l, r) => l.label.localeCompare(r.label))
            }
            return groups
        },
        filteredGroups() {
            const f = this.filter.trim().toLowerCase()
            if (!f) return this.groups
            return this.groups.filter((g) =>
                g.label.toLowerCase().includes(f) || g.instances.some((i) => i.address.toLowerCase().includes(f)))
        },
        visibleGroups() {
            return this.showAll ? this.filteredGroups : this.filteredGroups.slice(0, RENDER_LIMIT)
        },
        hiddenCount() {
            return this.filteredGroups.length - this.visibleGroups.length
        },
        allExpanded() {
            return this.visibleGroups.length > 0 && this.visibleGroups.every((g) => this.expanded[g.id])
        },
    },
    template: `
        <div class="accordion-item border rounded mb-4">
            <span class="accordion-header stack-accordion-header" style="display: flex;">
                <button @click="toggleAll" class="btn btn-light btn-sm my-1 ms-1" title="Expand all resources in index">
                    <i :class="{
                        'bi-chevron-expand': !allExpanded,
                        'bi-chevron-contract': allExpanded,
                    }"></i>
                </button>
                <button id="btn-resources-index" @click="open = !open" class="accordion-button" :class="{ collapsed: !open }">
                    <i class="bi-list-ul me-2 color-gray-dark"></i>
                    <span style="font-weight: 500;">Resources Index</span>
                    <span class="badge bg-secondary ms-2" title="Groups in the current grouping">{{ groups.length }}</span>
                    <span class="ms-3 small text-muted">{{ instances.length }} changes</span>
                </button>
            </span>
            <div v-if="open" class="accordion-collapse">
                <div class="accordion-body">
                    <div v-if="instances.length === 0" class="alert alert-info mb-0">Zero-diff. Remote configuration fully matches code.</div>
                    <template v-else>
                        <div class="d-flex flex-wrap align-items-center gap-2 mb-2 index-toolbar">
                            <span class="small text-muted">Group by</span>
                            <div class="btn-group btn-group-sm" role="group">
                                <button v-for="m in availableModes" type="button" class="btn"
                                        :class="mode === m.name ? 'btn-secondary' : 'btn-outline-secondary'"
                                        :title="m.hint" @click="mode = m.name">{{ m.title }}</button>
                            </div>
                            <span class="small text-muted ms-2">Sort</span>
                            <div class="btn-group btn-group-sm" role="group">
                                <button type="button" class="btn" :class="sort === 'name' ? 'btn-secondary' : 'btn-outline-secondary'"
                                        @click="sort = 'name'">Name</button>
                                <button type="button" class="btn" :class="sort === 'count' ? 'btn-secondary' : 'btn-outline-secondary'"
                                        @click="sort = 'count'">Count</button>
                            </div>
                            <input v-model="filter" type="search" class="form-control form-control-sm ms-2 index-filter"
                                   placeholder="Filter by address…">
                            <button v-if="splits.size" type="button" class="btn btn-sm btn-link" @click="splits = new Set()"
                                    title="Mask all index keys again">Merge {{ splits.size }} split key{{ splits.size > 1 ? 's' : '' }}</button>
                        </div>
                        <div class="accordion">
                            <div class="accordion-item" v-for="group in visibleGroups" :key="group.id">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(group.label)" class="btn btn-light btn-sm" title="Copy address">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button"
                                            :class="{ collapsed: !expanded[group.id] }" @click="toggle(group.id)">
                                        <span class="index-counters">
                                            <template v-for="c in categories">
                                                <Counter v-if="group.counts[c.name]" :value="group.counts[c.name]"
                                                         :color="c.color" :icon="c.icon" :title="c.title"></Counter>
                                            </template>
                                        </span>
                                        <span class="ms-1 hscroll font-monospace small index-label"><template v-for="part in group.parts"><span
                                            v-if="part.text !== undefined">{{ part.text }}</span><span
                                            v-else-if="part.split" class="key-split" @click.stop="toggleSplit(part.splitID)"
                                            title="Split by this key; click to mask it again">{{ [...part.values][0] }}</span><span
                                            v-else-if="part.values.size === 1" class="key-single" @click.stop="toggleSplit(part.splitID)"
                                            title="The only key here; click to split by it everywhere">{{ [...part.values][0] }}</span><span
                                            v-else class="key-mask" @click.stop="toggleSplit(part.splitID)"
                                            :title="keysTitle(part)">[×{{ part.values.size }}]</span></template></span>
                                        <span class="ms-2 me-2 d-flex gap-1 flex-shrink-0">
                                            <span class="badge bg-info" title="Stacks">{{ group.stackCount }} stack{{ group.stackCount > 1 ? 's' : '' }}</span>
                                        </span>
                                    </button>
                                </span>
                                <div v-if="expanded[group.id]" class="accordion-collapse">
                                    <div class="accordion-body ps-4 py-2">
                                        <div :class="{ 'index-stacks': !group.stacks.some((st) => showInstances(group, st)) }">
                                            <div v-for="stack in group.stacks" class="mb-1 index-stack">
                                                <a href="#" @click.prevent="navigate(primary(stack.resources[0]))" class="text-decoration-none">
                                                    <i class="bi-box-arrow-up-right me-1"></i>{{ stack.path }}
                                                </a>
                                                <span v-if="stack.resources.length > 1" class="badge bg-light text-dark ms-1">{{ stack.resources.length }}</span>
                                                <KindLinks v-if="!showInstances(group, stack)" :res="stack.resources[0]" @navigate="navigate"></KindLinks>
                                                <div v-if="showInstances(group, stack)" class="ms-4 small font-monospace">
                                                    <div v-for="res in stackResources(group, stack)">
                                                        <a href="#" @click.prevent="navigate(primary(res))" class="text-decoration-none text-secondary">
                                                            <span v-if="res.previousAddress">{{ res.previousAddress }} → </span>{{ res.address }}
                                                        </a>
                                                        <KindLinks :res="res" @navigate="navigate"></KindLinks>
                                                    </div>
                                                    <a v-if="stack.resources.length > instancesPerStack && !expandedStacks[group.id + stack.path]"
                                                       href="#" @click.prevent="expandedStacks[group.id + stack.path] = true">
                                                        … {{ stack.resources.length - instancesPerStack }} more
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-if="hiddenCount > 0" class="mt-2">
                            <button class="btn btn-sm btn-outline-secondary" @click="showAll = true">Show {{ hiddenCount }} more groups</button>
                        </div>
                        <div v-if="filteredGroups.length === 0" class="small text-muted mt-2">Nothing matches the filter.</div>
                    </template>
                </div>
            </div>
        </div>
    `,
    created() {
        this.instancesPerStack = INSTANCES_PER_STACK
    },
    methods: {
        copy(s) {
            navigator.clipboard.writeText(s)
        },
        navigate(inst) {
            this.$emit('navigate', {
                stackPath: inst.stackPathSanitized,
                resourceAddress: inst.address,
                kind: inst.kind,
            })
        },
        toggle(id) {
            this.expanded[id] = !this.expanded[id]
        },
        toggleAll() {
            if (this.allExpanded) {
                this.expanded = {}
            } else {
                this.open = true
                for (const g of this.visibleGroups) this.expanded[g.id] = true
            }
        },
        toggleSplit(splitID) {
            const s = new Set(this.splits)
            if (s.has(splitID)) s.delete(splitID)
            else s.add(splitID)
            this.splits = s
        },
        keysTitle(part) {
            const values = [...part.values].sort()
            const shown = values.slice(0, 15).join("\n")
            const more = values.length > 15 ? `\n… ${values.length - 15} more` : ""
            return `${values.length} distinct keys, click to split by them:\n${shown}${more}`
        },
        showInstances(group, stack) {
            const res = stack.resources[0]
            return stack.resources.length > 1 || res.address !== group.label || res.previousAddress
        },
        stackResources(group, stack) {
            if (this.expandedStacks[group.id + stack.path]) return stack.resources
            return stack.resources.slice(0, INSTANCES_PER_STACK)
        },
        primary(res) {
            return res.instances.find((i) => i.kind !== "drift") || res.instances[0]
        },
    }
}
