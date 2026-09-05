import React from 'react';

const NEW_GROUP_OPTION = '__new__';

export default class GroupIdPicker extends React.Component {
    constructor(props) {
        super(props);
        this.state = { creating: false, draft: '' };
    }

    handleSelectChange(event) {
        const next = event.target.value;
        if (next === NEW_GROUP_OPTION) {
            this.setState({ creating: true, draft: '' });
            return;
        }
        this.props.onChange(next);
    }

    commitNewGroup() {
        const trimmed = this.state.draft.trim();
        this.setState({ creating: false, draft: '' });
        if (trimmed) this.props.onChange(trimmed);
    }

    render() {
        const { value, existingGroups, ariaLabel } = this.props;
        if (this.state.creating) {
            return (
                <input
                    aria-label={ariaLabel}
                    autoFocus
                    value={this.state.draft}
                    placeholder="Neue Gruppen-ID"
                    onChange={event => this.setState({ draft: event.target.value })}
                    onBlur={() => this.commitNewGroup()}
                    onKeyDown={event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            this.commitNewGroup();
                        }
                    }}
                />
            );
        }
        const options = value && !existingGroups.includes(value) ? [value, ...existingGroups] : existingGroups;
        return (
            <select aria-label={ariaLabel} value={value || ''} onChange={event => this.handleSelectChange(event)}>
                <option value="">keine Gruppe</option>
                {options.map(group => <option key={group} value={group}>{group}</option>)}
                <option value={NEW_GROUP_OPTION}>Neue Gruppe …</option>
            </select>
        );
    }
}
