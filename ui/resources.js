export default {
    props: {
        resourcesIndex: {
            type: Array,
            default: [],
        }
    },
    emits: ['navigate'],
    data() {
        return {
            expandedAll: false,
        }
    },
    computed: {
        totalResources() {
            return this.resourcesIndex.length
        }
    },
    template: `
        <div class="accordion-item border rounded mb-4">
            <span class="accordion-header stack-accordion-header" style="display: flex;">
                <button @click="toggleAll" class="btn btn-light btn-sm my-1 ms-1" title="Expand all resources in index">
                    <i :class="{
                        'bi-chevron-expand': !expandedAll,
                        'bi-chevron-contract': expandedAll,
                    }"></i>
                </button>
                <button id="btn-resources-index" @click="expandIndex" class="accordion-button collapsed">
                    <i class="bi-list-ul me-2 color-gray-dark"></i>
                    <span style="font-weight: 500;">Resources Index</span>
                    <span class="badge bg-secondary ms-2">{{ totalResources }}</span>
                </button>
            </span>
            <div id="resources-index-accordion" class="accordion-collapse collapse" data-bs-parent="#accordion">
                <div class="accordion-body">
                    <div v-if="resourcesIndex.length > 0" class="accordion">
                        <div class="accordion-item" v-for="resource in resourcesIndex">
                            <span class="accordion-header resource-accordion-header" style="display: flex;">
                                <span @click="copy(resource.address)" class="btn btn-light btn-sm" title="Copy resource address">
                                    <i class="bi-clipboard"></i>
                                </span>
                                <button class="accordion-button accordion-button-light resource-accordion-button collapsed" data-bs-toggle="collapse"
                                        :data-bs-target="'#' + resource.addressSanitized">
                                    <span class="ms-1 hscroll">{{ resource.address }}</span>
                                    <span class="badge bg-info ms-2">{{ resource.stacks.length }}</span>
                                </button>
                            </span>
                            <div :id="resource.addressSanitized" class="accordion-collapse collapse"
                                 data-bs-parent="#resource-accordion">
                                <div class="accordion-body ps-4">
                                    <div v-for="stack in resource.stacks" class="mb-1">
                                        <a href="#" @click.prevent="navigateToResource(stack.pathSanitized, resource.address)"
                                           class="text-decoration-none">
                                            <i class="bi-box-arrow-up-right me-1"></i>{{ stack.path }}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-else class="alert alert-info mb-0">Zero-diff. Remote configuration fully matches code.</div>
                </div>
            </div>
        </div>
    `,
    methods: {
        copy(s) {
            navigator.clipboard.writeText(s)
        },
        navigateToResource(stackPath, resourceAddress) {
            this.$emit('navigate', { stackPath, resourceAddress })
        },
        toggleAll() {
            if (this.expandedAll) {
                this.collapseAll()
            } else {
                this.expandAll()
            }
        },
        expandIndex() {
            const btn = document.getElementById('btn-resources-index')
            const container = document.getElementById('resources-index-accordion')

            if (btn.classList.contains('collapsed')) {
                btn.classList.remove('collapsed')
                container.classList.add('show')
            } else {
                btn.classList.add('collapsed')
                container.classList.remove('show')
                if (this.expandedAll) {
                    this.collapseAll()
                }
            }
        },
        expandAll() {
            const btn = document.getElementById('btn-resources-index')
            if (btn.classList.contains('collapsed')) {
                this.expandIndex()
            }

            document.querySelectorAll('#resources-index-accordion .accordion-button').forEach(
                (el) => el.classList.remove('collapsed'))
            document.querySelectorAll('#resources-index-accordion .accordion-collapse').forEach(
                (el) => el.classList.add('show'))
            this.expandedAll = true
        },
        collapseAll() {
            document.querySelectorAll('#resources-index-accordion .accordion-button').forEach(
                (el) => el.classList.add('collapsed'))
            document.querySelectorAll('#resources-index-accordion .accordion-collapse').forEach(
                (el) => el.classList.remove('show'))
            this.expandedAll = false
        }
    }
}