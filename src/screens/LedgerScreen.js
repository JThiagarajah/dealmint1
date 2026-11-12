// Daily financial status: every day's money in / out (and, for All, the closing cash balance)
import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from '../theme';
import { Screen, Card, Segmented, Button, Empty } from '../components/ui';
import { ActivityRow, Loading, openMovement } from '../components/rows';
import AddMenu from '../components/AddMenu';
import { getLedger } from '../db/repo';
import useFocusData from '../utils/useFocusData';
import { useScope, SCOPE_TINT } from '../utils/scope';
import { money, moneyShort, relativeDay, prettyDate } from '../utils/format';

// What to show when there is nothing for the chosen filter
const EMPTY = {
  all: { icon: 'calendar-outline', title: 'No money movements yet', message: 'Everything you buy, spend, sell or receive in rent will appear here, day by day.', action: 'Add an expense', go: 'ExpenseForm' },
  spent: { icon: 'receipt-outline', title: 'Nothing spent yet', message: 'Repairs, legal fees, fuel and other costs will appear here.', action: 'Add an expense', go: 'ExpenseForm' },
  income: { icon: 'key-outline', title: 'No rent recorded yet', message: 'When a tenant pays, record it and it will appear here.', action: 'Record rent', go: 'IncomeForm' },
  deals: { icon: 'swap-horizontal-outline', title: 'No purchases or sales yet', message: 'Assets you buy and sell will appear here.', action: 'Add an asset', go: 'AssetForm' },
};

function EmptyDaily({ filter, hasAny, navigation, scope }) {
  const e = hasAny ? EMPTY[filter] : EMPTY.all;
  const params = e.go === 'AssetForm' ? (scope !== 'All' ? { type: scope } : {}) : { scope };
  return <Empty icon={e.icon} title={e.title} message={e.message} action={e.action} onAction={() => navigation.navigate(e.go, params)} />;
}

export default function LedgerScreen({ navigation }) {
  const { c, type } = useTheme();
  const { type: scope } = useScope();
  const [data] = useFocusData(() => getLedger(scope), [scope]);
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(20);
  const all = scope === 'All';

  if (!data) return <Loading />;

  const match = (e) =>
    filter === 'all' ? true :
    filter === 'spent' ? e.kind === 'direct' || e.kind === 'indirect' :
    filter === 'income' ? e.kind === 'income' :
    e.kind === 'purchase' || e.kind === 'sale';

  const days = data.days.map((d) => ({ ...d, shown: d.entries.filter(match) })).filter((d) => d.shown.length);

  return (
    <Screen title="Daily" right={<AddMenu navigation={navigation} scope={scope} accent={c[SCOPE_TINT[scope]]} />}>
      <Card style={{ marginHorizontal: 16, marginTop: 8 }}>
        {all ? (
          <>
            <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>Cash balance now</Text>
            <Text style={[type.title1, { color: data.balance >= 0 ? c.text : c.red, fontVariant: ['tabular-nums'] }]}>{money(data.balance)}</Text>
            <Text style={[type.footnote, { color: c.text2 }]}>Starting capital {moneyShort(data.startingCapital)} − purchases − expenses + sales + rent</Text>
          </>
        ) : (
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>Money in</Text>
              <Text style={[type.title3, { color: c.green, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{moneyShort(data.totalIn)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.footnote, { color: c.text2, fontWeight: '600' }]}>Money out</Text>
              <Text style={[type.title3, { color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{moneyShort(data.totalOut)}</Text>
            </View>
          </View>
        )}
      </Card>

      <View style={{ marginHorizontal: 16, marginTop: 14 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, { value: 'spent', label: 'Spent' }, { value: 'income', label: 'Rent' }, { value: 'deals', label: 'Buy/Sell' }]}
        />
      </View>

      {days.length === 0 ? <EmptyDaily filter={filter} hasAny={data.days.length > 0} navigation={navigation} scope={scope} /> : null}

      {days.slice(0, limit).map((d) => (
        <View key={d.date} style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginHorizontal: 20, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={[type.headline, { color: c.text }]}>{relativeDay(d.date)}</Text>
              <Text style={[type.caption, { color: c.text2, fontWeight: '400' }]}>
                {prettyDate(d.date)}{d.closing !== null ? ` · closing ${moneyShort(d.closing)}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {d.moneyOut ? <Text style={[type.footnote, { color: c.text, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>Out {money(d.moneyOut)}</Text> : null}
              {d.moneyIn ? <Text style={[type.footnote, { color: c.green, fontWeight: '600', fontVariant: ['tabular-nums'] }]}>In {money(d.moneyIn)}</Text> : null}
            </View>
          </View>
          <Card style={{ marginHorizontal: 16 }} padded={false}>
            {d.shown.map((e, i) => <ActivityRow key={e.kind + e.ref} r={e} first={i === 0} hideDate onPress={() => openMovement(navigation, e)} />)}
          </Card>
        </View>
      ))}

      {days.length > limit ? (
        <Button title="Show earlier days" kind="tinted" onPress={() => setLimit(limit + 30)} style={{ marginHorizontal: 16, marginTop: 20 }} />
      ) : null}
    </Screen>
  );
}
