import { StyleSheet, View } from 'react-native'
import { DELIVERY_FIELDS, type AccountForm, type DeliveryKey, type FieldErrors } from '../accountFields'
import { Field } from './Field'

type Props = {
    form: AccountForm
    errors: FieldErrors
    editable?: boolean
    onChange: (key: DeliveryKey, value: string) => void
}

/** Name, phone and address inputs shared by register, profile and checkout. */
export function DeliveryFields({ form, errors, editable = true, onChange }: Props) {
    const full = DELIVERY_FIELDS.filter((f) => !f.half)
    const half = DELIVERY_FIELDS.filter((f) => f.half)
    return (
        <>
            {full.map((f) => (
                <Field
                    key={f.key}
                    label={f.label}
                    placeholder={f.placeholder}
                    value={form[f.key]}
                    error={errors[f.key]}
                    editable={editable}
                    keyboardType={f.keyboardType}
                    autoComplete={f.autoComplete}
                    autoCapitalize={f.key === 'fullName' || f.key === 'addressLine1' ? 'words' : 'none'}
                    onChangeText={(v) => onChange(f.key, v)}
                />
            ))}
            <View style={styles.grid}>
                {half.map((f) => (
                    <View key={f.key} style={styles.half}>
                        <Field
                            label={f.label}
                            placeholder={f.placeholder}
                            value={form[f.key]}
                            error={errors[f.key]}
                            editable={editable}
                            keyboardType={f.keyboardType}
                            autoComplete={f.autoComplete}
                            autoCapitalize="words"
                            onChangeText={(v) => onChange(f.key, v)}
                        />
                    </View>
                ))}
            </View>
        </>
    )
}

const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, rowGap: 14 },
    half: { width: '50%', paddingHorizontal: 6 },
})
