const p=new(require('@prisma/client').PrismaClient)()
async function main(){
    const j=await p.ficoJournalEntry.findMany({where:{sourceModule:'SD'},select:{id:true,idempotencyKey:true,documentType:true,totalAmount:true,status:true,description:true},orderBy:{createdAt:'desc'},take:5})
    console.log('SD journals:',j.length)
    j.forEach(e=>console.log(' ',e.idempotencyKey,e.documentType,String(e.totalAmount),e.status,e.description))
    const s=await p.ficoCompanyAccountingSettings.findFirst({where:{company:{code:'AGCTEK'}},select:{status:true}})
    console.log('settings:',s?.status)
    // Check the failed accounting events — now that settings are ACTIVE they might succeed
    const events=await p.mmAccountingEvent.findMany({where:{status:'FAILED'},select:{id:true,eventType:true,lastError:true},take:3})
    console.log('Failed events:',events.length)
    events.forEach(e=>console.log(' ',e.eventType,e.lastError?.slice(0,80)))
    await p.$disconnect()
}
main().catch(console.error)
