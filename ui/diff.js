export default {
    props: ['data'],
    computed: {
        lines() {
            if (!this.data) {
                return ["For some reason, this object does not include textual diff. Please file an issue."]
            }
            return this.data.split('\n')
        }
    },
    methods: {
        getStyle(line) {
            let color = 'gray'
            if (line.match(/^ +[+]/)) color = 'green'
            else if (line.match(/^ +[~]/)) color = 'yellow'
            else if (line.match(/^ +[-]/)) color = 'red'
            else if (line.match(/^ +[#]/)) color = 'gray-dark'

            let res = {}
            res['color-'+color] = true
            return res
        }
    },
    template: `
        <div style="line-height: 0.9; white-space: pre;" class="hscroll pb-1">
            <template v-for="line in lines">
                <code :class="getStyle(line)">{{ line }}</code>
                <br>
            </template>
        </div>`
}
