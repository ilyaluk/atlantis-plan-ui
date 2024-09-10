import Diff from "./diff.js";
import Counter from "./counter.js";

export default {
    components: {Diff, Counter},
    props: {
        data: Object,
        showOutputs: Boolean,
        showDrifts: Boolean,
        showMoves: Boolean,
        executableName: String,
    },
    data() {
        return {
            expandedAll: false,
        }
    },
    mounted() {
        if (this.data.resource_diffs?.length <= 3) {
            this.expandResources()
        }
    },
    computed: {
        pathSanitized() {
            return this.sanitize(this.data.path)
        },
        resourceDiffs() {
            return this.data.resource_diffs || []
        },
        resourceDiffSorted() {
            const idxs = {
                "delete": 0,
                "delete,create": 1,
                "create,delete": 2,
                "create": 3,
                "update": 4,
            }
            return [...this.resourceDiffs].sort((l, r) => {
                let lt = l.actions.join(',')
                let rt = r.actions.join(',')
                if (lt !== rt) {
                    return idxs[lt] - idxs[rt]
                }
                return l.address.localeCompare(r.address)
            })
        },
        creates() {
            return this.resourceDiffs.filter((d) => (d.actions).includes('create')).length
        },
        deletes() {
            return this.resourceDiffs.filter((d) => (d.actions).includes('delete')).length
        },
        updates() {
            return this.resourceDiffs.filter((d) => (d.actions).includes('update')).length
        },
    },
    methods: {
        sanitize(val) {
            return val.replaceAll(/[^a-zA-Z0-9-_]/g, "-")
        },
        toggleAll() {
            if (this.expandedAll) {
                this.collapseAll()
            } else {
                this.expandAll()
            }
        },
        copy(s) {
            navigator.clipboard.writeText(s)
        },
        expandAll() {
            this.expand()
            this.expandResources()
        },
        expandResources() {
            document.querySelectorAll(`#${this.pathSanitized} .accordion-button`).forEach(
                (el) => el.classList.remove('collapsed'))
            document.querySelectorAll(`#${this.pathSanitized} .accordion-collapse`).forEach(
                (el) => el.classList.add('show'))
            this.expandedAll = true
        },
        collapseAll() {
            document.querySelectorAll(`#${this.pathSanitized} .accordion-button`).forEach(
                (el) => el.classList.add('collapsed'))
            document.querySelectorAll(`#${this.pathSanitized} .accordion-collapse`).forEach(
                (el) => el.classList.remove('show'))
            this.expandedAll = false
        },
        expand() {
            document.querySelector(`#header-${this.pathSanitized}`).classList.remove('collapsed')
            document.querySelector(`#${this.pathSanitized}`).classList.add('show')
        },
        collapse() {
            document.querySelector(`#header-${this.pathSanitized}`).classList.add('collapsed')
            document.querySelector(`#${this.pathSanitized}`).classList.remove('show')
        },
        scrollToView(e) {
            if (e.target.getAttribute("aria-expanded") === "false") {
                // get full diff element
                let rect = e.target.parentElement.parentElement.getBoundingClientRect()
                if (rect.y < 0) {
                    // if diff is not fully visible, scroll to top after collapse
                    e.target.scrollIntoView({behavior: "instant", block: "start"})
                }
            }
        }
    },
    template: `
        <div class="accordion-item" ref="collapse">
            <span class="accordion-header stack-accordion-header" style="display: flex;">
                <button @click="toggleAll" class="btn btn-light btn-sm my-1 ms-1" title="Expand all resources in stack">
                    <i :class="{
                        'bi-chevron-expand': !expandedAll,
                        'bi-chevron-contract': expandedAll,
                    }"></i>
                </button>
                <span @click="copy(data.path)" class="btn btn-light btn-sm my-1 ms-1" title="Copy path">
                    <i class="bi-clipboard"></i>
                </span>
                <span @click="copy(executableName + ' apply -p ' + data.path.replaceAll('/', '_'))" class="btn btn-light btn-sm my-1 ms-1" title="Copy apply comment">
                    <i class="bi-clipboard-check"></i>
                </span>
                <a :href="data.log_url" target="_blank" :class="{
                    'btn': true,
                    'btn-light': true,
                    'btn-sm': true,
                    'm-1': true,
                    'disabled': !data.log_url,
                }" role="button" title="Open plan log">
                    <i class="bi-card-text"></i>
                </a>
                <button :id="'header-' + pathSanitized" class="accordion-button collapsed" data-bs-toggle="collapse"
                        :data-bs-target="'#' + pathSanitized" @click="scrollToView">
                    <span v-if="data.lock_url" class="me-2 color-yellow" title="Stack locked">
                        <i class="bi-hourglass-bottom"></i>
                    </span>
                    <span v-else-if="data.plan_error" class="me-2 color-yellow" title="Plan error">
                        <i class="bi-exclamation-octagon-fill"></i>
                    </span>
                    <template v-else>
                        <span v-if="data?.resource_diffs?.length == 0" class="me-2 color-gray" title="Zero-diff">
                            <i class="bi-patch-check-fill"></i>
                        </span>
                        <template v-else>
                            <Counter :value="creates" :opaque="creates == 0" color="green" icon="patch-plus-fill" title="Resources to create"></Counter>
                            <Counter :value="updates" :opaque="updates == 0" color="orange" icon="patch-exclamation-fill" title="Resources to update"></Counter>
                            <Counter :value="deletes" :opaque="deletes == 0" color="red" icon="patch-minus-fill" title="Resources to delete"></Counter>
                        </template>

                        <Counter v-if="data?.output_diffs?.length > 0" :opaque="!showOutputs" 
                            :value="data.output_diffs.length" color="blue" icon="diagram-2-fill" title="Changed outputs"></Counter>
                        <Counter v-if="data?.drift_diffs?.length > 0" :opaque="!showDrifts" 
                            :value="data.drift_diffs.length" color="indigo" icon="arrow-down-left-circle-fill" title="Remote updates"></Counter>
                        <Counter v-if="data?.moves?.length > 0" :opaque="!showMoves" 
                            :value="data.moves.length" color="purple" icon="arrow-left-right" title="Resource moves"></Counter>
                    </template>
                    {{ data.path }}
                </button>
            </span>
            <div :id="pathSanitized" class="accordion-collapse collapse" data-bs-parent="#accordion">
                <div class="accordion-body">
                    <span v-if="data.lock_url">
                        This stack is locked by another PR (<a :href="data.lock_pr_url">#{{ data.lock_pr_url.split('/').pop() }}</a>). 
                        Check with PR author ({{ data.lock_pr_author }}) whether it's okay to <a :href="data.lock_url">unlock</a> the stack.
                    </span>
                    <span v-else-if="data.plan_error">
                        This plan errored.
                        <template v-if="data.log_url">See <a :href="data.log_url" target="_blank">plan log</a>.</template>
                        <template v-else>Plan log is unavailable, check PR comments or Atlantis logs.</template>
                    </span>
                    <template v-else-if="data?.resource_diffs?.length || data?.output_diffs?.length || data?.drift_diffs?.length || data?.moves?.length">
                        <span v-if="!data?.resource_diffs?.length">
                            There are no resource changes in the plan, but there are some changes in stack:<br><br>
                        </span>
                        <div class="accordion">
                            <div class="accordion-item" v-for="item in resourceDiffSorted">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(item.address)" class="btn btn-light btn-sm" title="Copy resource address">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                            :data-bs-target="'#' + pathSanitized + '__' + sanitize(item.address)">
                                        <template v-for="action in item.actions">
                                            <i v-if="action == 'create'" class="bi-patch-plus-fill me-1 color-green"></i>
                                            <i v-if="action == 'update'"  class="bi-patch-exclamation-fill me-1 color-orange"></i>
                                            <i v-if="action == 'delete'"  class="bi-patch-exclamation-fill me-1 color-red"></i>
                                        </template>
                                        <span class="ms-1 hscroll">{{ item.address }}</span>
                                    </button>
                                </span>
                                <div :id="pathSanitized + '__' + sanitize(item.address)" class="accordion-collapse collapse"
                                     data-bs-parent="#accordion">
                                    <div class="accordion-body">
                                        <Diff :data="item.diff"></Diff>
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item" v-for="item in data.output_diffs" v-if="showOutputs">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(item.address)" class="btn btn-light btn-sm">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                            :data-bs-target="'#' + pathSanitized + '__output_' + sanitize(item.address)">
                                        <i class="bi-diagram-2-fill me-1 color-blue"></i>
                                        <span class="ms-1 hscroll">output.{{ item.address }}</span>
                                    </button>
                                </span>
                                <div :id="pathSanitized + '__output_' + sanitize(item.address)" class="accordion-collapse collapse"
                                     data-bs-parent="#accordion">
                                    <div class="accordion-body">
                                        <Diff :data="item.diff"></Diff>
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item" v-for="item in data.drift_diffs" v-if="showDrifts">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(item.address)" class="btn btn-light btn-sm">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                            :data-bs-target="'#' + pathSanitized + '__drift_' + sanitize(item.address)">
                                        <i class="bi-arrow-down-left-circle-fill me-1 color-indigo"></i>
                                        <span class="ms-1 hscroll">{{ item.address }}</span>
                                    </button>
                                </span>
                                <div :id="pathSanitized + '__drift_' + sanitize(item.address)" class="accordion-collapse collapse"
                                     data-bs-parent="#accordion">
                                    <div class="accordion-body">
                                        <Diff :data="item.diff"></Diff>
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item" v-for="item in data.moves" v-if="showMoves">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(item.previous_address + ' → ' + item.address)" class="btn btn-light btn-sm">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button accordion-button-no-icon collapsed" data-bs-toggle="collapse">
                                        <i class="bi-arrow-left-right me-1 color-purple"></i>
                                        <span class="ms-1 hscroll">{{ item.previous_address }} → {{ item.address }}</span>
                                    </button>
                                </span>
                            </div>
                        </div>
                    </template>
                    <template v-else>
                        Zero-diff. Remote configuration fully matches code.
                    </template>
                </div>
            </div>
        </div>
    `
}