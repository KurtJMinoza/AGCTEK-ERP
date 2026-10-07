import { StyleSheet, Text, View } from 'react-native'
import { storeName } from '../catalog'
import { divisionTheme } from '../theme'

/** "Sold by AWIC" tag so shoppers know which store fulfils the item. */
export function SellerTag({ divisionId, short }: { divisionId: string | null; short?: boolean }) {
    const theme = divisionTheme(divisionId)
    return (
        <View style={[styles.tag, { backgroundColor: theme.soft }]}>
            <Text style={[styles.label, { color: theme.text }]} numberOfLines={1}>
                {short ? '' : 'Sold by '}
                {storeName(divisionId)}
            </Text>
        </View>
    )
}

const styles = StyleSheet.create({
    tag: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    label: { fontSize: 11, fontWeight: '600' },
})
