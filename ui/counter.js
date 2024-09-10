export default {
    props: {
        value: null,
        icon: String,
        color: String,
        nomono: Boolean,
        opaque: Boolean,
        title: String,
    },
    computed: {
        spanClass() {
            let res = {'me-2': true}
            res['color-' + this.color] = true
            if (this.opaque) {
                res['opacity-20'] = true
            }
            return res
        },
        textClass() {
            let res = {'ms-1': true}
            if (!this.nomono) {
                res['font-monospace'] = true
            }
            return res
        },
    },
    template: `
        <span :class="spanClass" :title="title">
            <i :class="'bi-' + icon"></i>
            <span :class="textClass">{{ value }}</span>
        </span>`
}
