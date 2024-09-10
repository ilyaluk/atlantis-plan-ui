import Diff from "./diff.js";
import Counter from "./counter.js";
import { Stack } from "./models.js"

export default {
    components: {Diff, Counter},
    props: {
        data: {
            type: Stack,
            default: new Stack({}),
        },
        show: {
            type: Object,
            default: {
                outputs: true,
                drifts: true,
                refactors: true,
            },
        },
        executableName: String,
    },
    data() {
        return {
            expandedAll: false,
        }
    },
    mounted() {
        if (this.data.resourceDiffs.length <= 3) {
            this.expandResources()
        }
    },
    computed: {
        divID() {
            return this.data.pathSanitized
        },
        btnID() {
            return "btn-" + this.data.pathSanitized
        },
        resourcesVisible() {
            return this.data.resourceDiffsSorted.filter((d) => {
                if (this.show.refactors) { return true }
                return d.actions.join(",") !== "forget" // hide forgets if we hide refactors
            })
        }
    },
    methods: {
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
            document.querySelectorAll(`#${this.divID} .accordion-button`).forEach(
                (el) => el.classList.remove('collapsed'))
            document.querySelectorAll(`#${this.divID} .accordion-collapse`).forEach(
                (el) => el.classList.add('show'))
            this.expandedAll = true
        },
        collapseAll() {
            document.querySelectorAll(`#${this.divID} .accordion-button`).forEach(
                (el) => el.classList.add('collapsed'))
            document.querySelectorAll(`#${this.divID} .accordion-collapse`).forEach(
                (el) => el.classList.remove('show'))
            this.expandedAll = false
        },
        expand() {
            document.querySelector(`#${this.btnID}`).classList.remove('collapsed')
            document.querySelector(`#${this.divID}`).classList.add('show')
        },
        collapse() {
            document.querySelector(`#${this.btnID}`).classList.add('collapsed')
            document.querySelector(`#${this.divID}`).classList.remove('show')
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
                <a :href="data.logURL" target="_blank" :class="{
                    'btn': true,
                    'btn-light': true,
                    'btn-sm': true,
                    'm-1': true,
                    'disabled': !data.logURL,
                }" role="button" title="Open plan log">
                    <i class="bi-card-text"></i>
                </a>
                <button :id="btnID" class="accordion-button collapsed" data-bs-toggle="collapse"
                        :data-bs-target="'#' + divID" @click="scrollToView">
                    <span v-if="data.lockURL" class="me-2 color-yellow" title="Stack locked">
                        <i class="bi-hourglass-bottom"></i>
                    </span>
                    <span v-else-if="data.planError" class="me-2 color-yellow" title="Plan error">
                        <i class="bi-exclamation-octagon-fill"></i>
                    </span>
                    <template v-else>
                        <span v-if="data.resourceDiffs.length == 0" class="me-2 color-gray" title="Zero-diff">
                            <i class="bi-patch-check-fill"></i>
                        </span>
                        <template v-else>
                            <Counter :value="data.createsNum" :opaque="data.createsNum == 0" color="green" icon="patch-plus-fill" title="Resources to create"></Counter>
                            <Counter :value="data.updatesNum" :opaque="data.updatesNum == 0" color="orange" icon="patch-exclamation-fill" title="Resources to update"></Counter>
                            <Counter :value="data.deletesNum" :opaque="data.deletesNum == 0" color="red" icon="patch-minus-fill" title="Resources to delete"></Counter>
                        </template>

                        <Counter v-if="data.outputDiffs.length > 0" :opaque="!show.outputs" 
                            :value="data.outputDiffs.length" color="blue" icon="diagram-2-fill" title="Changed outputs"></Counter>
                        <Counter v-if="data.driftDiffs.length > 0" :opaque="!show.drifts" 
                            :value="data.driftDiffs.length" color="indigo" icon="arrow-down-left-circle-fill" title="Remote updates"></Counter>

                        <!-- refactorings -->
                        <Counter v-if="data.moves.length > 0" :opaque="!show.refactors" 
                            :value="data.moves.length" color="purple" icon="arrow-left-right" title="Resource moves"></Counter>
                        <Counter v-if="data.importsNum" :opaque="!show.refactors"
                            :value="data.importsNum" color="purple" icon="box-arrow-in-down-left" title="Resources to import"></Counter>
                        <Counter v-if="data.forgetsNum" :opaque="!show.refactors"
                            :value="data.forgetsNum" color="purple" icon="x-circle" title="Resources to forget"></Counter>
                    </template>
                    {{ data.path }}
                </button>
            </span>
            <div :id="divID" class="accordion-collapse collapse" data-bs-parent="#accordion">
                <div class="accordion-body">
                    <span v-if="data.lockURL">
                        This stack is locked by another PR (<a :href="data.lockPRURL">#{{ data.lockPRURL.split('/').pop() }}</a>). 
                        Check with PR author ({{ data.lockPRAuthor }}) whether it's okay to <a :href="data.lockURL">unlock</a> the stack, then re-plan.
                    </span>
                    <span v-else-if="data.planError">
                        This plan errored.
                        <template v-if="data.logURL">See <a :href="data.logURL" target="_blank">plan log</a>.</template>
                        <template v-else>Plan log is unavailable, check PR comments or Atlantis logs.</template>
                    </span>
                    <template v-else-if="data.resourceDiffs.length || data.outputDiffs.length || data.driftDiffs.length || data.moves.length">
                        <span v-if="!data.resourceDiffs.length">
                            There are no resource changes in the plan, but there are some changes in stack:<br><br>
                        </span>
                        <div class="accordion">
                            <div class="accordion-item" v-for="diff in resourcesVisible">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(diff.address)" class="btn btn-light btn-sm" title="Copy resource address">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                            :data-bs-target="'#' + diff.addressSanitized">
                                        <template v-for="action in diff.actions">
                                            <i v-if="action == 'create'" class="bi-patch-plus-fill me-1 color-green"></i>
                                            <i v-if="action == 'update'" class="bi-patch-exclamation-fill me-1 color-orange"></i>
                                            <i v-if="action == 'delete'" class="bi-patch-minus-fill me-1 color-red"></i>
                                            <i v-if="action == 'forget'" class="bi-x-circle me-1 color-purple"></i>
                                        </template>
                                        <i v-if="show.refactors && diff.importID" class="bi-box-arrow-in-down-left me-1 color-purple"></i>
                                        <span class="ms-1 hscroll">{{ diff.address + (show.refactors && diff.importID ? " ← "+diff.importID : "") }}</span>
                                    </button>
                                </span>
                                <div :id="diff.addressSanitized" class="accordion-collapse collapse"
                                     data-bs-parent="#accordion">
                                    <div class="accordion-body">
                                        <Diff :data="diff.diff"></Diff>
                                    </div>
                                </div>
                            </div>
                            <!-- put moves next to end of diffs, because there will be removes -->
                            <div class="accordion-item" v-for="diff in data.moves" v-if="show.refactors">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(diff.previousAddress + ' → ' + diff.address)" class="btn btn-light btn-sm">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button accordion-button-no-icon collapsed" data-bs-toggle="collapse">
                                        <i class="bi-arrow-left-right me-1 color-purple"></i>
                                        <span class="ms-1 hscroll">{{ diff.previousAddress }} → {{ diff.address }}</span>
                                    </button>
                                </span>
                            </div>
                            <div class="accordion-item" v-for="diff in data.outputDiffs" v-if="show.outputs">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(diff.address)" class="btn btn-light btn-sm">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                            :data-bs-target="'#' + diff.addressSanitized">
                                        <i class="bi-diagram-2-fill me-1 color-blue"></i>
                                        <span class="ms-1 hscroll">output.{{ diff.address }}</span>
                                    </button>
                                </span>
                                <div :id="diff.addressSanitized" class="accordion-collapse collapse"
                                     data-bs-parent="#accordion">
                                    <div class="accordion-body">
                                        <Diff :data="diff.diff"></Diff>
                                    </div>
                                </div>
                            </div>
                            <div class="accordion-item" v-for="diff in data.driftDiffs" v-if="show.drifts">
                                <span class="accordion-header resource-accordion-header" style="display: flex;">
                                    <span @click="copy(diff.address)" class="btn btn-light btn-sm">
                                        <i class="bi-clipboard"></i>
                                    </span>
                                    <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                            :data-bs-target="'#' + diff.addressSanitized">
                                        <i class="bi-arrow-down-left-circle-fill me-1 color-indigo"></i>
                                        <span class="ms-1 hscroll">{{ diff.address }}</span>
                                    </button>
                                </span>
                                <div :id="diff.addressSanitized" class="accordion-collapse collapse"
                                     data-bs-parent="#accordion">
                                    <div class="accordion-body">
                                        <Diff :data="diff.diff"></Diff>
                                    </div>
                                </div>
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