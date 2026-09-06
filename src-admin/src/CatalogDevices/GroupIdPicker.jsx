import React from 'react';

const NEW_GROUP_OPTION = '__new__';
const MAX_GROUP_ID_LENGTH = 128;

function validateGroupId(value) {
    if (!value.trim()) return 'Gruppen-ID darf nicht leer sein.';
    if (value.length > MAX_GROUP_ID_LENGTH) return `Gruppen-ID darf maximal ${MAX_GROUP_ID_LENGTH} Zeichen enthalten.`;
    if ([...value].some(character => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
    })) return 'Gruppen-ID darf keine Steuerzeichen enthalten.';
    return '';
}

export default class GroupIdPicker extends React.Component {
    constructor(props) {
        super(props);
        this.state = { creating: false, draft: '', error: '' };
    }

    handleSelectChange(event) {
        const next = event.target.value;
        if (next === NEW_GROUP_OPTION) {
            this.setState({ creating: true, draft: '', error: '' });
            return;
        }
        this.setState({ error: '' });
        this.props.onChange(next);
    }

    commitNewGroup() {
        const { draft } = this.state;
        const error = validateGroupId(draft);
        if (error) {
            this.setState({ error });
            return;
        }
        this.setState({ creating: false, draft: '', error: '' });
        this.props.onChange(draft.trim());
    }

    render() {
        const { value, existingGroups, ariaLabel } = this.props;
        if (this.state.creating) {
            return (
                <label>
                    <input
                        aria-label={ariaLabel}
                        autoFocus
                        value={this.state.draft}
                        placeholder="Neue Gruppen-ID"
                        onChange={event => this.setState({ draft: event.target.value, error: '' })}
                        onBlur={() => this.commitNewGroup()}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                this.commitNewGroup();
                            }
                        }}
                    />
                    {this.state.error ? <span role="alert">{this.state.error}</span> : null}
                </label>
            );
        }
        const groups = existingGroups || [];
        const options = value && !groups.includes(value) ? [value, ...groups] : groups;
        return (
            <select aria-label={ariaLabel} value={value || ''} onChange={event => this.handleSelectChange(event)}>
                <option value="">keine Gruppe</option>
                {options.map(group => <option key={group} value={group}>{group}</option>)}
                <option value={NEW_GROUP_OPTION}>Neue Gruppe …</option>
            </select>
        );
    }
}
