using System;
using System.Collections.Generic;
using NativeCapturePrototype;

namespace NativeTrialLifetime {
  public interface ITrialBatchCalls {
    long MonotonicMilliseconds {get;}
    long StartedMs {get;}
    Dictionary<string,object> ExecuteCell(int index);
  }
  public static class TrialBatchPolicy {
    public static Dictionary<string,object> Execute(ITrialBatchCalls calls){
      Guard.Require(calls!=null,"Bounded batch calls required");long start=calls.StartedMs,last=calls.MonotonicMilliseconds;var outcomes=new List<object>();var errors=new List<string>();
      for(int i=0;i<2;i++)try{
        long now=calls.MonotonicMilliseconds;Guard.Require(start>=0&&last>=start&&now>=last,"Batch clock origin/backward movement invalid");last=now;if(now-start>=60000){errors.Add("Insufficient remainder of110s batch for one45s+5s leaf");break;}
        var cell=calls.ExecuteCell(i);Guard.Require(cell!=null&&cell.ContainsKey("hardBlockNativeOwnership")&&cell["hardBlockNativeOwnership"] is bool,"Cell ownership stop receipt absent");outcomes.Add(cell);
        long after=calls.MonotonicMilliseconds;Guard.Require(after>=now,"Batch cell clock moved backward");last=after;if((bool)cell["hardBlockNativeOwnership"]){errors.Add("Unconfirmed exact host exit; no next native cell");break;}if(after-start>=110000){errors.Add("Batch deadline exceeded");break;}
      }catch(Exception e){errors.Add("Cell:"+i+":"+e.GetType().Name+":"+e.Message);break;}
      return new Dictionary<string,object>{{"schema",1},{"kind","SYNTHETIC_TWO_CELL_BATCH_OUTCOME"},{"elapsedMs",(calls.MonotonicMilliseconds-start).ToString(System.Globalization.CultureInfo.InvariantCulture)},{"cells",outcomes},{"errors",errors.ToArray()},{"completeCellAcceptance",false}};
    }
  }
}
